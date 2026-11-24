import { eq, sql } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';
import { getVisitStatusThresholdsByUserIds } from '#lib/server/visit-status-settings.js';

import { people, user, visits } from '../db/schema';
import type { Db, NotificationJob } from '../notification-jobs/run-job';
import { buildVisitWarningEmail } from './templates';
import {
	buildVisitWarningEntityId,
	buildVisitWarningSubject,
	formatVisitWarningDate,
	getVisitWarningStatus
} from './visit-warning-utils';

type VisitWarningCandidate = {
	person: typeof people.$inferSelect;
	user: typeof user.$inferSelect;
	lastVisitDate: string;
	warningStatus: 'yellow' | 'critical';
};

/**
 * Non-archived, non-exempt people whose latest visit puts them in yellow/critical status,
 * using each owner's visit-status thresholds. Shared by the warnings job and the morning digest.
 */
export async function loadVisitWarningCandidates(
	db: Db,
	today: string
): Promise<VisitWarningCandidate[]> {
	// Get all people with their last visit date
	const allPeople = db
		.select({
			person: people,
			user: user
		})
		.from(people)
		.innerJoin(user, eq(people.userId, user.id))
		.where(eq(people.isArchived, false))
		.all();

	logger.debug(`   Found ${allPeople.length} people to check`);
	const visitThresholdsByUserId = await getVisitStatusThresholdsByUserIds(
		allPeople.map(({ user: userData }) => userData.id),
		db
	);

	const candidates: VisitWarningCandidate[] = [];

	for (const { person, user: userData } of allPeople) {
		if (person.isExempt) {
			logger.debug('   ⏭️  Skipping exempt person', { personId: person.id });
			continue;
		}

		// Get last visit for this person
		const lastVisit = db
			.select()
			.from(visits)
			.where(eq(visits.personId, person.id))
			.orderBy(sql`${visits.date} DESC`)
			.limit(1)
			.get();

		if (!lastVisit) {
			// No visits recorded yet, skip
			continue;
		}

		const warningStatus = getVisitWarningStatus(
			lastVisit.date,
			person.scheduledVisitDate,
			visitThresholdsByUserId.get(userData.id),
			today
		);
		if (!warningStatus) {
			continue;
		}

		candidates.push({ person, user: userData, lastVisitDate: lastVisit.date, warningStatus });
	}

	return candidates;
}

/** Email + push when a group member turns Overdue or Critical; repeats at most weekly. */
export const visitWarningJob: NotificationJob<VisitWarningCandidate> = {
	type: 'visit_warning',
	label: 'visit warnings',
	dedupe: { days: 7 },
	candidates: ({ db, clock }) => loadVisitWarningCandidates(db, clock.today),
	recipient: (candidate) => candidate.user,
	entityId: ({ person, warningStatus }) => buildVisitWarningEntityId(person.id, warningStatus),
	message: ({ person, user: owner, lastVisitDate, warningStatus }) => ({
		logSubject: buildVisitWarningSubject(person.name, warningStatus),
		email: buildVisitWarningEmail(
			owner.name,
			person.name,
			formatVisitWarningDate(lastVisitDate),
			warningStatus
		),
		push: {
			message:
				warningStatus === 'critical'
					? `Critical visit warning: ${person.name} needs a visit.`
					: `Visit warning: ${person.name} is due for a visit.`,
			title: 'Synapse - Visit Warning',
			tags: 'busts_in_silhouette',
			priority: warningStatus === 'critical' ? 4 : 3
		}
	})
};
