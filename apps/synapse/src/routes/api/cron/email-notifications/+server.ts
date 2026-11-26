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
	monitor: {
		slug: 'synapse-email-notifications',
		// Must match the cron line in .github/workflows/synapse-notifications-cron.yml.
		schedule: '7,37 0-5,12-23 * * *',
		// GitHub Actions scheduled runs are often 10–30 min late.
		checkinMargin: 30,
		maxRuntime: 10
	},
	logger
});
