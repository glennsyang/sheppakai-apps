import { eq } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';
import { getWorkoutNotificationTag } from '#lib/utils/workout.js';

import { getDb } from '../db';
import { user, workoutReminders } from '../db/schema';
import { sendWorkoutReminderEmail } from './index';
import {
	shouldFireToday,
	alreadySentToday,
	logNotification,
	sendReminderNotification
} from './notification-log';

/**
 * Process workout reminders
 */
export async function processWorkoutReminders(
	currentDay: number,
	currentHour: string,
	currentMinute: string
): Promise<void> {
	const db = getDb();
	logger.debug('\n💪 Processing workout reminders...');

	const reminders = db
		.select({
			reminder: workoutReminders,
			user: user
		})
		.from(workoutReminders)
		.innerJoin(user, eq(workoutReminders.userId, user.id))
		.where(eq(workoutReminders.enabled, true))
		.all();

	logger.debug(`   Found ${reminders.length} enabled workout reminders`);

	let sentCount = 0;

	for (const { reminder, user: userData } of reminders) {
		// Check if should fire today
		if (!shouldFireToday(currentDay, reminder.cadence, reminder.daysOfWeek)) {
			continue;
		}

		// Send if reminder time has already passed today.
		// Using >= instead of a fixed window because GitHub Actions cron scheduling
		// is not guaranteed to run at exact intervals — it can be significantly delayed.
		// Duplicate sends are prevented by the alreadySentToday check below.
		const [reminderHour, reminderMinute] = reminder.time.split(':');
		const reminderTimeInMinutes =
			Number.parseInt(reminderHour, 10) * 60 + Number.parseInt(reminderMinute || '0', 10);
		const currentTimeInMinutes =
			Number.parseInt(currentHour, 10) * 60 + Number.parseInt(currentMinute, 10);

		if (currentTimeInMinutes < reminderTimeInMinutes) {
			continue;
		}

		// Check if already sent today
		if (await alreadySentToday(userData.id, 'workout_reminder', reminder.id)) {
			logger.debug(`   ⏭️  Already sent to ${userData.email} today`);
			continue;
		}

		// Send email
		logger.debug(
			`   📧 Sending workout reminder to ${userData.email} (${reminder.workoutType} at ${reminder.time})`
		);

		try {
			await sendWorkoutReminderEmail(
				userData.email,
				userData.name,
				reminder.workoutType,
				reminder.time
			);

			await sendReminderNotification(
				`You scheduled a ${reminder.workoutType} workout for today.`,
				'Workout Reminder',
				getWorkoutNotificationTag(reminder.workoutType)
			);

			await logNotification(
				userData.id,
				'workout_reminder',
				reminder.id,
				`Time for your ${reminder.workoutType} workout!`
			);

			sentCount++;
			logger.debug(`   ✅ Sent successfully`);
		} catch (error) {
			logger.error(`   ❌ Failed to send:`, error);
		}
	}

	logger.debug(`   📊 Sent ${sentCount} workout reminders`);
}
