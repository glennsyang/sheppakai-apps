import { CRON_SECRET } from '$app/env/private';
import { createCronHandler } from '@sheppakai/shared/cron';

import { runEmailNotifications } from '#lib/server/email/email-notifications.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = createCronHandler({
	secret: CRON_SECRET,
	name: 'email notifications',
	// runEmailNotifications reports failure instead of throwing; rethrow so the response is a 500.
	run: async () => {
		const outcome = await runEmailNotifications();
		if (!outcome.ok) throw outcome.error;
	},
	logger
});
