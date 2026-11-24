import { getUser } from '#lib/server/actions/auth-guard.js';
import { getDb } from '#lib/server/db/index.js';
import { loadGroupStatuses } from '#lib/server/group-status.js';
import { stringListSchema, safeParse } from '#lib/server/json.js';
import { logger } from '#lib/server/logger.js';
import { getTodayString } from '#lib/utils/date.js';
import { getStatusPriority, type PersonWithStatus } from '#lib/utils/visit-status.js';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const groupStatuses = await loadGroupStatuses(getDb(), {
			userId: getUser(locals).id,
			today: getTodayString()
		});

		const peopleWithStatus: PersonWithStatus[] = groupStatuses.map(
			({
				person,
				lastVisit,
				nextVisitDate,
				status,
				daysSinceLastVisit,
				daysUntilStatusChange
			}) => ({
				id: person.id,
				name: person.name,
				isExempt: person.isExempt,
				nextVisitDate,
				lastVisit: lastVisit
					? {
							date: lastVisit.date,
							companions: safeParse(
								lastVisit.companions,
								stringListSchema,
								null,
								'visit.companions'
							)
						}
					: null,
				status,
				daysSinceLastVisit,
				daysUntilStatusChange,
				createdAt: person.createdAt
			})
		);

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
		return {
			people: [],
			loadError: 'Failed to load group members. Please try refreshing the page.'
		};
	}
};
