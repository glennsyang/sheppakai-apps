import { AUTH_ALERTS_URL, REMINDER_ALERTS_URL } from '$app/env/private';
import { logger } from '$lib/server/logger';
import { sendNtfy } from '@sheppakai/shared/ntfy';

/**
 * Sends a notification to your phone
 * @param message The main body of the notification
 * @param title Optional title
 * @param priority 1-5 (5 is max/urgent)
 */
export async function sendAuthAlerts(message: string, title = 'App Alert', priority = 3) {
	return sendNtfy(AUTH_ALERTS_URL, message, { title, priority, logger });
}

/**
 * Sends a notification to your phone
 * @param message The main body of the notification
 * @param title Optional title
 * @param priority 1-5 (5 is max/urgent)
 */
export async function sendReminderAlerts(
	message: string,
	title = 'Synapse - Reminder Alert',
	priority = 3,
	tags = 'rotating_light'
) {
	return sendNtfy(REMINDER_ALERTS_URL, message, { title, priority, tags, logger });
}
