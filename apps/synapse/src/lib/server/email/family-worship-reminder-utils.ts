import { plannedTopicOf, type TopicRef, type WeekPlan } from '#lib/utils/family-worship.js';

export const FAMILY_WORSHIP_REMINDER_NOTIFICATION_TYPE = 'family_worship_reminder';

const WEDNESDAY = 3;
/** Morning heads-up, Pacific time: the first cron run at or after this sends it. */
const REMINDER_MINUTES = 9 * 60;

/** Wednesday, at or after 09:00 Pacific. */
export function isFamilyWorshipReminderTime(
	currentDay: number,
	currentHour: string,
	currentMinute: string
): boolean {
	const minutes = Number.parseInt(currentHour, 10) * 60 + Number.parseInt(currentMinute, 10);
	return currentDay === WEDNESDAY && minutes >= REMINDER_MINUTES;
}

/** The topic to remind about, or null when the week is already logged or has nothing planned. */
export function getReminderTopic(week: WeekPlan | undefined): TopicRef | null {
	if (!week || week.session) return null;
	return plannedTopicOf(week);
}

export function buildFamilyWorshipReminderSubject(topicTitle: string): string {
	const safeTitle = topicTitle.replace(/[\r\n]+/g, ' ').trim();
	return `[Synapse] 📖 Family worship tonight: ${safeTitle}`;
}
