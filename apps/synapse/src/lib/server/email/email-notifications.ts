/**
 * Email Notifications Cron Job
 *
 * Runs every 10 minutes to send scheduled reminders:
 * - Workout reminders (based on workout_reminders table)
 * - Meditation reminders (based on meditation_schedules table)
 * - Visit warnings (for people in yellow/red visit status)
 * - Daily agenda digests at 6:00 AM PT (based on daily_agenda_entries)
 * - Tasks due-today digests at 6:00 AM PT (based on tasks.due_date)
 *
 * Logs all sent emails in email_notifications table to prevent duplicates.
 */

import { logger } from '$lib/server/logger';
import { APP_TIME_ZONE, getTodayString } from '$lib/utils/date';

import { processDailyAgendaDigests, processTasksDueTodayDigests } from './digests';
import { processMeditationReminders } from './meditation-reminders';
import { processScheduledVisitReminders, processVisitsTodayReminders } from './visit-reminders';
import { processVisitWarnings } from './visit-warnings';
import { processWorkoutReminders } from './workout-reminders';

/**
 * Main execution
 */
export async function runEmailNotifications(): Promise<{ ok: true } | { ok: false; error: Error }> {
	logger.debug('🚀 Starting email notifications job run...');
	logger.debug(`📅 Current time (UTC): ${new Date().toISOString()}`);

	// Get current time info
	const now = new Date();

	// Convert UTC time to PST/PDT (automatically handles DST)
	const pstFormatter = new Intl.DateTimeFormat('en-US', {
		timeZone: APP_TIME_ZONE,
		hour: '2-digit',
		hour12: false,
		minute: '2-digit'
	});

	const pstTime = pstFormatter.format(now); // e.g., "07:30"
	const [currentHour, currentMinute] = pstTime.split(':');
	const currentTime = `${currentHour}:${currentMinute}`;

	// Get day of week in PST (important for weekly reminders)
	const pstDayFormatter = new Intl.DateTimeFormat('en-US', {
		timeZone: APP_TIME_ZONE,
		weekday: 'short'
	});
	const pstDayStr = pstDayFormatter.format(now);
	const dayMap: Record<string, number> = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6
	};
	const currentDay: number = dayMap[pstDayStr] || 0;
	const todayPacific = getTodayString(now);

	logger.debug(
		`⏰ Current time (PST/PDT): ${currentTime}, Day: ${currentDay}, Date: ${todayPacific}`
	);

	try {
		await processDailyAgendaDigests(currentHour, currentMinute, todayPacific);
		await processTasksDueTodayDigests(currentHour, currentMinute, todayPacific);
		await processWorkoutReminders(currentDay, currentHour, currentMinute);
		await processMeditationReminders(currentDay, currentHour, currentMinute);
		await processVisitWarnings();
		await processVisitsTodayReminders(todayPacific);
		await processScheduledVisitReminders();

		logger.debug('\n✅ Email notifications cron job completed successfully!');
		return { ok: true };
	} catch (error) {
		logger.error('\n❌ Email notifications cron job failed:', error);
		return { ok: false, error: error instanceof Error ? error : new Error('Unknown error') };
	}
}
