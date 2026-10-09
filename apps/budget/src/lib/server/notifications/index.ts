import { AUTH_ALERTS_URL, BUDGET_ALERTS_URL } from '$app/env/private';
import { sendNtfy } from '@sheppakai/shared/ntfy';

import { logger } from '../logger';

/**
 * Sends a security/auth notification to your phone
 * @param message The main body of the notification
 * @param title Optional title
 * @param priority 1-5 (5 is max/urgent)
 */
export async function sendAuthAlerts(message: string, title = 'App Alert', priority = 3) {
	return sendNtfy(AUTH_ALERTS_URL, message, { title, priority, logger });
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
	return sendNtfy(BUDGET_ALERTS_URL, message, { title, priority, logger });
}
