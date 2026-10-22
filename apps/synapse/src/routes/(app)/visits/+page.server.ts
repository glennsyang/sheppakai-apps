import { and, desc, eq } from 'drizzle-orm';

import { getUser } from '#lib/server/actions/auth-guard.js';
import { getDb } from '#lib/server/db/index.js';
import { people } from '#lib/server/db/schema/index.js';
import { stringListSchema, safeParse } from '#lib/server/json.js';
import { logger } from '#lib/server/logger.js';
import { getVisitStatusThresholdsForUser } from '#lib/server/visit-status-settings.js';
import { getLatestVisitsByPersonId, getPersonVisitStatus } from '#lib/server/visits.js';
import { getTodayString } from '#lib/utils/date.js';
import { getStatusPriority, type PersonWithStatus } from '#lib/utils/visit-status.js';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const db = getDb();
		const today = getTodayString();
		const userId = getUser(locals).id;
		const visitStatusThresholds = await getVisitStatusThresholdsForUser(userId, db);

		// Load all people for the user
		const userPeople = await db.query.people.findMany({
			where: and(eq(people.userId, userId), eq(people.isArchived, false)),
			orderBy: [desc(people.createdAt)]
		});

		const latestVisitsByPersonId = await getLatestVisitsByPersonId(
			userPeople.map((person) => person.id),
			userId,
			db
		);

		const peopleWithStatus: PersonWithStatus[] = userPeople.map((person) => {
			const latestVisit = latestVisitsByPersonId.get(person.id);
			const statusInfo = getPersonVisitStatus(person, latestVisit, today, visitStatusThresholds);
			const { effectiveFollowUpDate } = statusInfo;
			const nextFollowUpDate =
				effectiveFollowUpDate && effectiveFollowUpDate >= today ? effectiveFollowUpDate : null;

			return {
				id: person.id,
				name: person.name,
				isExempt: person.isExempt,
				nextFollowUpDate,
				lastVisit: latestVisit
					? {
							date: latestVisit.date,
							companions: safeParse(
								latestVisit.companions,
								stringListSchema,
								null,
								'visit.companions'
							)
						}
					: null,
				status: statusInfo.status,
				daysSinceLastVisit: statusInfo.daysSinceLastVisit,
				daysUntilStatusChange: statusInfo.daysUntilStatusChange,
				createdAt: person.createdAt
			};
		});

		// Sort by status priority, then by days since last visit
		peopleWithStatus.sort((a, b) => {
			const priorityDiff = getStatusPriority(a.status) - getStatusPriority(b.status);
			if (priorityDiff !== 0) return priorityDiff;

			// If same status, sort by days since last visit (descending)
			if (a.daysSinceLastVisit === null && b.daysSinceLastVisit === null) return 0;
			if (a.daysSinceLastVisit === null) return 1;
			if (b.daysSinceLastVisit === null) return -1;
			return b.daysSinceLastVisit - a.daysSinceLastVisit;
		});

		return { people: peopleWithStatus };
	} catch (error) {
		logger.error('Failed to load people', error);
		return { people: [], loadError: 'Failed to load people. Please try refreshing the page.' };
	}
};
