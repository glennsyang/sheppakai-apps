import { and, desc, eq, type SQL, sql } from 'drizzle-orm';

import type { getDb } from '#lib/server/db/index.js';
import { people, user, visits } from '#lib/server/db/schema/index.js';
import { getVisitStatusThresholdsByUserIds } from '#lib/server/visit-status-settings.js';
import { calculatePersonVisitStatus, type VisitStatus } from '#lib/utils/visit-status.js';

type Db = ReturnType<typeof getDb>;
type Person = typeof people.$inferSelect;
type Visit = typeof visits.$inferSelect;

/** One Group Member with their Visit Status and the inputs it was worked out from. */
export type GroupMemberStatus = {
	person: Person;
	owner: { id: string; name: string; email: string };
	status: VisitStatus;
	lastVisit: Visit | null;
	/** The member's Next Visit, only while it is today or later; a lapsed one reads as null. */
	nextVisitDate: string | null;
	daysSinceLastVisit: number | null;
	daysUntilStatusChange: number | null;
};

type MemberFilter = { userId?: string; personId?: string; archived?: boolean };

function memberWhere({ userId, personId, archived = false }: MemberFilter): SQL | undefined {
	return and(
		eq(people.isArchived, archived),
		userId ? eq(people.userId, userId) : undefined,
		personId ? eq(people.id, personId) : undefined
	);
}

/**
 * Each matching member's latest visit: newest date, then newest createdAt, then id, so ties
 * always resolve the same way. Only visits logged by the member's owner count.
 */
async function loadLatestVisits(db: Db, filter: MemberFilter): Promise<Map<string, Visit>> {
	const ranked = db
		.select({
			id: visits.id,
			rn: sql<number>`row_number() over (partition by ${visits.personId} order by ${visits.date} desc, ${visits.createdAt} desc, ${visits.id} desc)`.as(
				'rn'
			)
		})
		.from(visits)
		.innerJoin(people, and(eq(visits.personId, people.id), eq(visits.userId, people.userId)))
		.where(memberWhere(filter))
		.as('ranked_visits');

	const rows = await db
		.select({ visit: visits })
		.from(visits)
		.innerJoin(ranked, eq(ranked.id, visits.id))
		.where(eq(ranked.rn, 1));

	return new Map(rows.map(({ visit }) => [visit.personId, visit]));
}

/**
 * Visit Status for every active (non-Archived) Group Member, scoped to one owner when `userId`
 * is given and to one member when `personId` is given. Each owner's thresholds, Exempt, the
 * Scheduled override and a lapsed Next Visit are all applied here, so callers only read
 * `status`.
 */
export async function loadGroupStatuses(
	db: Db,
	{ userId, personId, today }: { userId?: string; personId?: string; today: string }
): Promise<GroupMemberStatus[]> {
	const filter = { userId, personId };
	const [members, latestVisits] = await Promise.all([
		db
			.select({ person: people, owner: { id: user.id, name: user.name, email: user.email } })
			.from(people)
			.innerJoin(user, eq(people.userId, user.id))
			.where(memberWhere(filter))
			.orderBy(desc(people.createdAt)),
		loadLatestVisits(db, filter)
	]);
	const thresholdsByUserId = await getVisitStatusThresholdsByUserIds(
		members.map(({ owner }) => owner.id),
		db
	);

	return members.map(({ person, owner }) => {
		const lastVisit = latestVisits.get(person.id) ?? null;
		const nextVisitDate =
			person.scheduledVisitDate && person.scheduledVisitDate >= today
				? person.scheduledVisitDate
				: null;
		const statusInfo = calculatePersonVisitStatus(
			lastVisit?.date ?? null,
			person.isExempt,
			nextVisitDate,
			today,
			thresholdsByUserId.get(owner.id)
		);
		return { person, owner, lastVisit, nextVisitDate, ...statusInfo };
	});
}

/** Every owner's Archived Members (newest change first), with each one's last visit date. */
export async function loadArchivedMembers(db: Db) {
	const filter = { archived: true };
	const [members, latestVisits] = await Promise.all([
		db
			.select({ person: people, ownerEmail: user.email })
			.from(people)
			.innerJoin(user, eq(people.userId, user.id))
			.where(memberWhere(filter))
			.orderBy(desc(people.updatedAt)),
		loadLatestVisits(db, filter)
	]);

	return members.map(({ person, ownerEmail }) => ({
		...person,
		ownerEmail,
		lastVisitDate: latestVisits.get(person.id)?.date ?? null
	}));
}
