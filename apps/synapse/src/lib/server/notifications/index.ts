import { AUTH_ALERTS_URL, REMINDER_ALERTS_URL } from '$app/env/private';
import { logger } from '$lib/server/logger';

/**
 * Sends a notification to your phone
 * @param message The main body of the notification
 * @param title Optional title
 * @param priority 1-5 (5 is max/urgent)
 */
export async function sendAuthAlerts(message: string, title = 'App Alert', priority = 3) {
	try {
		// Fails closed: an unset AUTH_ALERTS_URL defaults to a non-resolving `.invalid` host
		// (see @sheppakai/shared/env). Alert bodies can carry a user's email, so they must
		// never be POSTed to a placeholder domain.
		const { hostname } = new URL(AUTH_ALERTS_URL);
		if (hostname === 'invalid' || hostname.endsWith('.invalid')) {
			logger.info('Alerts disabled (AUTH_ALERTS_URL unset); skipping', { title });
			return false;
		}

		const response = await fetch(`${AUTH_ALERTS_URL}`, {
			method: 'POST',
			body: message,
			headers: {
				Title: title,
				Priority: priority.toString(),
				Tags: 'rotating_light'
			}
		});

		return response.ok;
	} catch (err) {
		logger.error('Notification failed', err);
		return false;
	}
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
	try {
		const response = await fetch(`${REMINDER_ALERTS_URL}`, {
			method: 'POST',
			body: message,
			headers: {
				Title: title,
				Priority: priority.toString(),
				Tags: tags
			}
		});

		return response.ok;
	} catch (err) {
		logger.error('Notification failed', err);
		return false;
	}
}
