import { logger } from '$lib/server/logger';
import { getTodayString } from '$lib/utils/date';
import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '../db';
import { emailNotifications } from '../db/schema';
import { sendReminderAlerts } from '../notifications';

/**
 * Check if this reminder should fire today based on cadence and days_of_week
 */
export function shouldFireToday(
	currentDay: number,
	cadence: string,
	daysOfWeek: string | null
): boolean {
	if (cadence === 'daily') {
		return true;
	}
	if (cadence === 'weekly' && daysOfWeek) {
		try {
			const days: number[] = JSON.parse(daysOfWeek);
			return days.includes(currentDay);
		} catch (e) {
			logger.error('❌ Error parsing days_of_week:', e);
			return false;
		}
	}
	return false;
}

/**
 * Check if we already sent this notification today
 */
export async function alreadySentToday(
	userId: string,
	notificationType: string,
	entityId: string
): Promise<boolean> {
	const db = getDb();
	const today = getTodayString(); // YYYY-MM-DD in Pacific time

	const existing = db
		.select()
		.from(emailNotifications)
		.where(
			and(
				eq(emailNotifications.userId, userId),
				eq(emailNotifications.notificationType, notificationType),
				eq(emailNotifications.entityId, entityId)
			)
		)
		.orderBy(sql`${emailNotifications.sentAt} DESC`)
		.get();

	// Compare in Pacific time rather than the UTC date SQLite's DATE() would
	// extract from the stored epoch timestamp, since "today" is defined in
	// Pacific time throughout this file.
	return !!existing && getTodayString(existing.sentAt) === today;
}

/**
 * Log sent email notification
 */
export async function logNotification(
	userId: string,
	notificationType: string,
	entityId: string,
	subject: string
): Promise<void> {
	const db = getDb();
	await db.insert(emailNotifications).values({
		userId,
		notificationType,
		entityId,
		sentAt: new Date(),
		emailSubject: subject
	});
}

/**
 * Send a short phone notification alongside reminder emails
 */
export async function sendReminderNotification(
	message: string,
	title: string,
	tags: string,
	priority = 3
): Promise<void> {
	const sent = await sendReminderAlerts(message, title, priority, tags);

	if (!sent) {
		logger.warn('Reminder notification could not be delivered', {
			title,
			message
		});
	}
}
