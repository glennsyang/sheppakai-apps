import { AUTH_ALERTS_URL, BUDGET_ALERTS_URL } from '$app/env/private';

import { logger } from '../logger';

/**
 * POSTs an ntfy.sh push notification. Best-effort: a delivery failure is logged and
 * swallowed (returns `false`) so it never breaks the flow that triggered it.
 *
 * Fails closed: an unset alerts URL defaults to a non-resolving `.invalid` host (see
 * src/env.ts). That is detected here and the request skipped entirely, since alert
 * bodies can carry a user's email and must never be POSTed to a placeholder domain.
 */
async function sendNtfy(url: string, message: string, title: string, priority: number) {
	let target: URL;
	try {
		target = new URL(url);
	} catch {
		logger.error('Alerts URL is not a valid URL; skipping alert');
		return false;
	}
	if (target.hostname === 'invalid' || target.hostname.endsWith('.invalid')) {
		logger.info('Alerts disabled (alerts URL unset); skipping', { title });
		return false;
	}

	try {
		const response = await fetch(target.href, {
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
 * Sends a security/auth notification to your phone
 * @param message The main body of the notification
 * @param title Optional title
 * @param priority 1-5 (5 is max/urgent)
 */
export async function sendAuthAlerts(message: string, title = 'App Alert', priority = 3) {
	return sendNtfy(AUTH_ALERTS_URL, message, title, priority);
}

/**
 * Sends a budget threshold notification to your phone
 * @param message The main body of the notification
 * @param title Optional title
 * @param priority 1-5 (5 is max/urgent)
 */
export async function sendBudgetAlerts(
	message: string,
	title = 'Sheppakai - Budget Alert',
	priority = 3
) {
	return sendNtfy(BUDGET_ALERTS_URL, message, title, priority);
}
