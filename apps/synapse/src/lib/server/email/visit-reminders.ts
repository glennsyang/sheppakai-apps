import { loadGroupStatuses, type GroupMemberStatus } from '#lib/server/group-status.js';
import { addDaysToDateString } from '#lib/utils/date.js';

import type { Db, NotificationJob } from '../notification-jobs/run-job';
import {
	buildScheduledVisitReminderEntityIdForPerson,
	buildScheduledVisitReminderSubject,
	buildVisitTodayReminderEntityIdForPerson,
	buildVisitTodayReminderSubject,
	formatReminderDate,
	SCHEDULED_VISIT_REMINDER_NOTIFICATION_TYPE,
	VISIT_TODAY_REMINDER_NOTIFICATION_TYPE
} from './scheduled-visit-reminder-utils';
import { buildScheduledVisitReminderEmail, buildVisitTodayReminderEmail } from './templates';

type NextVisitCandidate = {
	person: GroupMemberStatus['person'];
	user: GroupMemberStatus['owner'];
};

/** Group members whose Next Visit is on `date`; Exempt members get no reminders. */
async function loadNextVisitsOn(
	db: Db,
	today: string,
	date: string
): Promise<NextVisitCandidate[]> {
	const members = await loadGroupStatuses(db, { today });
	return members
		.filter(({ person, nextVisitDate }) => nextVisitDate === date && !person.isExempt)
		.map(({ person, owner }) => ({ person, user: owner }));
}

/** Email + push on the day of a group member's Next Visit. */
export const visitTodayReminderJob: NotificationJob<NextVisitCandidate> = {
	type: VISIT_TODAY_REMINDER_NOTIFICATION_TYPE,
	label: 'visit-today reminders',
	dedupe: 'pacific-day',
	candidates: ({ db, clock }) => loadNextVisitsOn(db, clock.today, clock.today),
	recipient: (candidate) => candidate.user,
	entityId: ({ person }) => buildVisitTodayReminderEntityIdForPerson(person.id),
	message: ({ person, user: owner }, { clock }) => {
		const formattedDate = formatReminderDate(clock.today);
		return {
			logSubject: buildVisitTodayReminderSubject(person.name),
			email: buildVisitTodayReminderEmail(owner.name, person.name, formattedDate),
			push: {
				message: `You have a visit with ${person.name} today, ${formattedDate}.`,
				title: 'Synapse - Visit Today',
				tags: 'busts_in_silhouette',
				priority: 3
			}
		};
	}
};

const SCHEDULED_VISIT_REMINDER_DAYS_AHEAD = 7;

function oneWeekAhead(today: string): string {
	return addDaysToDateString(today, SCHEDULED_VISIT_REMINDER_DAYS_AHEAD);
}

/** Email + push one week (Pacific days) before a group member's Next Visit. */
export const scheduledVisitReminderJob: NotificationJob<NextVisitCandidate> = {
	type: SCHEDULED_VISIT_REMINDER_NOTIFICATION_TYPE,
	label: 'scheduled visit reminders',
	dedupe: 'pacific-day',
	candidates: ({ db, clock }) => loadNextVisitsOn(db, clock.today, oneWeekAhead(clock.today)),
	recipient: (candidate) => candidate.user,
	entityId: ({ person }) => buildScheduledVisitReminderEntityIdForPerson(person.id),
	message: ({ person, user: owner }, { clock }) => {
		const formattedNextVisitDate = formatReminderDate(oneWeekAhead(clock.today));
		return {
			logSubject: buildScheduledVisitReminderSubject(person.name),
			email: buildScheduledVisitReminderEmail(owner.name, person.name, formattedNextVisitDate),
			push: {
				message: `Upcoming visit with ${person.name} is scheduled for ${formattedNextVisitDate}.`,
				title: 'Synapse - Upcoming Visit',
				tags: 'calendar',
				priority: 3
			}
		};
	}
};
