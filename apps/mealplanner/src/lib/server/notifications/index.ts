import { AUTH_ALERTS_URL } from '$app/env/private';
import { sendNtfy } from '@sheppakai/shared/ntfy';

import { logger } from '../logger';

/**
 * Sends a security/auth push notification (ntfy.sh). Best-effort and fails closed when
 * `AUTH_ALERTS_URL` is unset; see `sendNtfy`.
 *
 * @param message The main body of the notification
 * @param title Optional title
 * @param priority 1-5 (5 is max/urgent)
 */
export async function sendAuthAlerts(message: string, title = 'App Alert', priority = 3) {
	return sendNtfy(AUTH_ALERTS_URL, message, { title, priority, logger });
}
