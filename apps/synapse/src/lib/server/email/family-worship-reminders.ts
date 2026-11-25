import { BETTER_AUTH_BASE_URL } from '$app/env/private';
import { eq } from 'drizzle-orm';

import {
	getThisWeek,
	getUsualWeekday,
	weekStartOf
} from '#lib/server/family-worship/family-worship.js';
import { addDaysToDateString } from '#lib/utils/date.js';

import { familyWorshipTopics, user } from '../db/schema';
import { hasTimePassed } from '../notification-jobs/clock';
import type { Db, NotificationJob } from '../notification-jobs/run-job';
import { buildLoggingReminderEmail, buildPlanningReminderEmail } from './templates';

const PLANNING_REMINDER_NOTIFICATION_TYPE = 'family_worship_planning_reminder';
const LOGGING_REMINDER_NOTIFICATION_TYPE = 'family_worship_logging_reminder';

const PLANNING_REMINDER_WEEKDAY = 1; // Monday
const PLANNING_REMINDER_TIME = '17:00';
const LOGGING_REMINDER_TIME = '09:00';
const FAMILY_WORSHIP_TAGS = 'open_book';

/** Once per user per week: the entity is the week's Monday, and a week is seven days. */
const ONCE_PER_WEEK = { days: 7 };

type Owner = { id: string; email: string; name: string };

type WeekCandidate = {
	user: Owner;
	weekStart: string;
	/** The topic the message names: the suggestion (planning) or the planned topic (logging). */
	topicTitle: string | null;
};

function familyWorshipUrl(): string {
	return new URL('/family-worship', BETTER_AUTH_BASE_URL).href;
}

/** Users who use Family Worship: anyone with at least one topic. */
function familyWorshipUsers(db: Db): Owner[] {
	return db
		.selectDistinct({ id: user.id, email: user.email, name: user.name })
		.from(user)
		.innerJoin(familyWorshipTopics, eq(familyWorshipTopics.userId, user.id))
		.all();
}

/**
 * Planning Reminder: Monday at or after 5pm Pacific, when this week isn't planned, has no session
 * and isn't a Skipped Week. Names the top of the Topic Queue.
 */
export const planningReminderJob: NotificationJob<WeekCandidate> = {
	type: PLANNING_REMINDER_NOTIFICATION_TYPE,
	label: 'family worship planning reminders',
	dedupe: ONCE_PER_WEEK,
	candidates: ({ db, clock }) => {
		if (clock.weekday !== PLANNING_REMINDER_WEEKDAY) return [];
		if (!hasTimePassed(clock, PLANNING_REMINDER_TIME)) return [];
		return familyWorshipUsers(db).flatMap((owner) => {
			const week = getThisWeek(db, owner.id, clock.today);
			if (week.plannedTopic || week.session || week.skip) return [];
			return [
				{ user: owner, weekStart: week.weekStart, topicTitle: week.suggestion?.title ?? null }
			];
		});
	},
	recipient: (candidate) => candidate.user,
	entityId: ({ weekStart }) => weekStart,
	message: ({ user: owner, topicTitle }) => ({
		logSubject: 'Planning Reminder',
		email: buildPlanningReminderEmail(owner.name, topicTitle, familyWorshipUrl()),
		push: {
			message: topicTitle
				? `This week isn't planned yet. Next in your Topic Queue: ${topicTitle}.`
				: "This week isn't planned yet. Choose a topic for family worship.",
			title: 'Synapse - Plan Family Worship',
			tags: FAMILY_WORSHIP_TAGS,
			click: familyWorshipUrl()
		}
	})
};

/**
 * Logging Reminder: at or after 9am Pacific the morning after the Usual Weekday, when that week
 * (the one holding the Usual Weekday, which for Sunday is the previous week) has no session and
 * isn't a Skipped Week. Names the week's planned topic.
 */
export const loggingReminderJob: NotificationJob<WeekCandidate> = {
	type: LOGGING_REMINDER_NOTIFICATION_TYPE,
	label: 'family worship logging reminders',
	dedupe: ONCE_PER_WEEK,
	candidates: async ({ db, clock }) => {
		if (!hasTimePassed(clock, LOGGING_REMINDER_TIME)) return [];
		const studyDay = addDaysToDateString(clock.today, -1);
		const candidates: WeekCandidate[] = [];
		for (const owner of familyWorshipUsers(db)) {
			const usualWeekday = await getUsualWeekday(db, owner.id);
			if (clock.weekday !== (usualWeekday + 1) % 7) continue;
			const week = getThisWeek(db, owner.id, studyDay);
			if (week.session || week.skip) continue;
			candidates.push({
				user: owner,
				weekStart: weekStartOf(studyDay),
				topicTitle: week.plannedTopic?.title ?? null
			});
		}
		return candidates;
	},
	recipient: (candidate) => candidate.user,
	entityId: ({ weekStart }) => weekStart,
	message: ({ user: owner, topicTitle }) => ({
		logSubject: 'Logging Reminder',
		email: buildLoggingReminderEmail(owner.name, topicTitle, familyWorshipUrl()),
		push: {
			message: topicTitle
				? `No family worship session logged this week. Planned topic: ${topicTitle}.`
				: 'No family worship session logged this week. Log it, or mark it as a Skipped Week.',
			title: 'Synapse - Log Family Worship',
			tags: FAMILY_WORSHIP_TAGS,
			click: familyWorshipUrl()
		}
	})
};
