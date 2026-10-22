import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import { visits } from '#lib/server/db/schema/index.js';
import {
	calculatePersonVisitStatus,
	getEffectiveFollowUpDate,
	type VisitStatus,
	type VisitStatusThresholds
} from '#lib/utils/visit-status.js';

type Visit = typeof visits.$inferSelect;

/**
 * Latest visit (by date, then createdAt) for each of the given people.
 * Pass `userId` to scope to one user's visits; omit it for cross-user admin views.
 */
export async function getLatestVisitsByPersonId(
	personIds: string[],
	userId?: string,
	db = getDb()
): Promise<Map<string, Visit>> {
	const latestVisitsByPersonId = new Map<string, Visit>();
	if (personIds.length === 0) {
		return latestVisitsByPersonId;
	}

	const byPerson = inArray(visits.personId, personIds);
	const orderedVisits = await db.query.visits.findMany({
		where: userId ? and(eq(visits.userId, userId), byPerson) : byPerson,
		orderBy: [asc(visits.personId), desc(visits.date), desc(visits.createdAt)]
	});

	for (const visit of orderedVisits) {
		if (!latestVisitsByPersonId.has(visit.personId)) {
			latestVisitsByPersonId.set(visit.personId, visit);
		}
	}

	return latestVisitsByPersonId;
}

/**
 * Visit status for one person from their latest visit (if any), applying the
 * effective follow-up date rule so every view agrees.
 */
export function getPersonVisitStatus(
	person: { isExempt: boolean; scheduledVisitDate: string | null },
	latestVisit: { date: string; followUpDate: string | null } | undefined,
	today: string,
	thresholds: VisitStatusThresholds
): {
	status: VisitStatus;
	daysSinceLastVisit: number | null;
	daysUntilStatusChange: number | null;
	effectiveFollowUpDate: string | null;
} {
	const effectiveFollowUpDate = getEffectiveFollowUpDate(
		latestVisit !== undefined,
		latestVisit?.followUpDate,
		person.scheduledVisitDate
	);
	const statusInfo = calculatePersonVisitStatus(
		latestVisit?.date ?? null,
		person.isExempt,
		effectiveFollowUpDate,
		today,
		thresholds
	);

	return { ...statusInfo, effectiveFollowUpDate };
}
