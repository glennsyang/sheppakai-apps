import { eq } from 'drizzle-orm';

import { loadFamilyWorship } from '#lib/server/family-worship.js';
import { logger } from '#lib/server/logger.js';

import { getDb } from '../db';
import { familyWorshipTopics, user } from '../db/schema';
import {
	buildFamilyWorshipReminderSubject,
	FAMILY_WORSHIP_REMINDER_NOTIFICATION_TYPE,
	getReminderTopic,
	isFamilyWorshipReminderTime
} from './family-worship-reminder-utils';
import { sendFamilyWorshipReminderEmail } from './index';
import { alreadySentToday, logNotification, sendReminderNotification } from './notification-log';

/**
 * Wednesday 09:00 PT heads-up for every user with active family worship topics whose week has
 * no entry yet, naming tonight's scheduled (or suggested) topic. One per user per week.
 */
export async function processFamilyWorshipReminders(
	currentDay: number,
	currentHour: string,
	currentMinute: string,
	todayPacific: string
): Promise<void> {
	if (!isFamilyWorshipReminderTime(currentDay, currentHour, currentMinute)) return;

	const db = getDb();
	logger.debug('\n📖 Processing family worship reminders...');

	const users = db
		.selectDistinct({ id: user.id, email: user.email, name: user.name })
		.from(familyWorshipTopics)
		.innerJoin(user, eq(familyWorshipTopics.userId, user.id))
		.where(eq(familyWorshipTopics.isArchived, false))
		.all();

	let sentCount = 0;

	for (const userData of users) {
		try {
			const { upcoming } = await loadFamilyWorship(db, userData.id, todayPacific, 1);
			const week = upcoming[0];
			const topic = getReminderTopic(week);
			if (!week || !topic) continue;

			if (
				await alreadySentToday(userData.id, FAMILY_WORSHIP_REMINDER_NOTIFICATION_TYPE, week.weekOf)
			) {
				continue;
			}

			const subject = buildFamilyWorshipReminderSubject(topic.title);
			await sendFamilyWorshipReminderEmail(userData.email, userData.name, topic.title);
			await sendReminderNotification(
				`Family worship tonight: ${topic.title}`,
				'Synapse - Family Worship',
				'book',
				3
			);
			await logNotification(
				userData.id,
				FAMILY_WORSHIP_REMINDER_NOTIFICATION_TYPE,
				week.weekOf,
				subject
			);
			sentCount++;
		} catch (error) {
			logger.error('Failed to send family worship reminder', error, { userId: userData.id });
		}
	}

	logger.debug(`   ✅ Sent ${sentCount} family worship reminders`);
}
