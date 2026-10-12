import { logger } from '$lib/server/logger';
import { eq } from 'drizzle-orm';

import { getDb } from '../db';
import { meditationRoutines, meditationSchedules, user } from '../db/schema';
import { sendMeditationReminderEmail } from './index';
import {
	shouldFireToday,
	alreadySentToday,
	logNotification,
	sendReminderNotification
} from './notification-log';

/**
 * Process meditation reminders
 */
export async function processMeditationReminders(
	currentDay: number,
	currentHour: string,
	currentMinute: string
): Promise<void> {
	const db = getDb();
	logger.debug('\n🧘 Processing meditation reminders...');

	const schedules = db
		.select({
			schedule: meditationSchedules,
			routine: meditationRoutines,
			user: user
		})
		.from(meditationSchedules)
		.innerJoin(meditationRoutines, eq(meditationSchedules.routineId, meditationRoutines.id))
		.innerJoin(user, eq(meditationSchedules.userId, user.id))
		.where(eq(meditationSchedules.enabled, true))
		.all();

	logger.debug(`   Found ${schedules.length} enabled meditation schedules`);

	let sentCount = 0;

	for (const { schedule, routine, user: userData } of schedules) {
		// Check if should fire today
		if (!shouldFireToday(currentDay, schedule.cadence, schedule.daysOfWeek)) {
			continue;
		}

		// Send if reminder time has already passed today.
		// Using >= instead of a fixed window because GitHub Actions cron scheduling
		// is not guaranteed to run at exact intervals — it can be significantly delayed.
		// Duplicate sends are prevented by the alreadySentToday check below.
		const [scheduleHour, scheduleMinute] = schedule.time.split(':');
		const scheduleTimeInMinutes =
			Number.parseInt(scheduleHour, 10) * 60 + Number.parseInt(scheduleMinute || '0', 10);
		const currentTimeInMinutes =
			Number.parseInt(currentHour, 10) * 60 + Number.parseInt(currentMinute, 10);

		if (currentTimeInMinutes < scheduleTimeInMinutes) {
			continue;
		}

		// Check if already sent today
		if (await alreadySentToday(userData.id, 'meditation_reminder', schedule.id)) {
			logger.debug(`   ⏭️  Already sent to ${userData.email} today`);
			continue;
		}

		// Send email
		logger.debug(
			`   📧 Sending meditation reminder to ${userData.email} (${routine.title} at ${schedule.time})`
		);

		try {
			await sendMeditationReminderEmail(
				userData.email,
				userData.name,
				routine.title,
				schedule.time
			);

			await sendReminderNotification(
				`Meditation reminder: ${routine.title} at ${schedule.time}.`,
				'Meditation Reminder',
				'lotus_position_man'
			);

			await logNotification(
				userData.id,
				'meditation_reminder',
				schedule.id,
				`Time for your meditation practice`
			);

			sentCount++;
			logger.debug(`   ✅ Sent successfully`);
		} catch (error) {
			logger.error(`   ❌ Failed to send:`, error);
		}
	}

	logger.debug(`   📊 Sent ${sentCount} meditation reminders`);
}
