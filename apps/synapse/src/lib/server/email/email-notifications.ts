/**
 * Email Notifications Cron Job
 *
 * Runs every 30 minutes (skipping overnight; see synapse-notifications-cron.yml) to send scheduled reminders:
 * - Morning digest push at each user's send time (default 6:00 AM app time): agenda, tasks due,
 *   tonight's dinner (mealplanner API), bills due this week (budget API) and overdue visits
 * - Tasks due-today digest emails at 6:00 AM app time (based on tasks.due_date)
 * - Workout reminders (based on workout_reminders table)
 * - Meditation reminders (based on meditation_schedules table)
 * - Visit warnings (for people in yellow/red visit status)
 * - Visit-today and one-week-ahead Next Visit reminders
 * - Family Worship Planning Reminder (Monday 5:00 PM app time, week not planned) and Logging Reminder
 *   (9:00 AM app time the morning after the Usual Weekday, no session logged); neither for a Skipped Week
 *
 * All times are in the app time zone (`APP_TIME_ZONE`, default America/Vancouver).
 *
 * Every job runs through `runNotificationJob`, which logs each send in the email_notifications
 * table to prevent duplicates.
 */

import { APP_TIME_ZONE } from '$app/env/public';

import { logger } from '#lib/server/logger.js';

import { getDb } from '../db';
import { morningDigestJob } from '../digest/process-morning-digests';
import { createJobClock } from '../notification-jobs/clock';
import type { Notifier } from '../notification-jobs/notifier';
import { productionNotifier } from '../notification-jobs/production-notifier';
import { runNotificationJob, type Db } from '../notification-jobs/run-job';
import { tasksDueTodayDigestJob } from './digests';
import { loggingReminderJob, planningReminderJob } from './family-worship-reminders';
import { meditationReminderJob } from './meditation-reminders';
import { scheduledVisitReminderJob, visitTodayReminderJob } from './visit-reminders';
import { visitWarningJob } from './visit-warnings';
import { workoutReminderJob } from './workout-reminders';

type RunOptions = { now?: Date; db?: Db; notifier?: Notifier };

/**
 * Main execution. One clock reading (`now`) is shared by every job in the run.
 */
export async function runEmailNotifications({
	now = new Date(),
	db = getDb(),
	notifier = productionNotifier
}: RunOptions = {}): Promise<{ ok: true } | { ok: false; error: Error }> {
	const clock = createJobClock(now);
	const ctx = { db, clock };

	logger.debug('🚀 Starting email notifications job run...', {
		utc: now.toISOString(),
		timeZone: APP_TIME_ZONE,
		appTime: `${clock.today} ${clock.hour}:${clock.minute}`,
		weekday: clock.weekday
	});

	try {
		await runNotificationJob(morningDigestJob, ctx, notifier);
		await runNotificationJob(tasksDueTodayDigestJob, ctx, notifier);
		await runNotificationJob(workoutReminderJob, ctx, notifier);
		await runNotificationJob(meditationReminderJob, ctx, notifier);
		await runNotificationJob(visitWarningJob, ctx, notifier);
		await runNotificationJob(visitTodayReminderJob, ctx, notifier);
		await runNotificationJob(scheduledVisitReminderJob, ctx, notifier);
		await runNotificationJob(planningReminderJob, ctx, notifier);
		await runNotificationJob(loggingReminderJob, ctx, notifier);

		logger.debug('\n✅ Email notifications cron job completed successfully!');
		return { ok: true };
	} catch (error) {
		logger.error('\n❌ Email notifications cron job failed:', error);
		return { ok: false, error: error instanceof Error ? error : new Error('Unknown error') };
	}
}
