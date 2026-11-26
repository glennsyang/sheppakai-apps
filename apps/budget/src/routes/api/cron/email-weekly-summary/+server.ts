import { CRON_SECRET } from '$app/env/private';
import { createCronHandler } from '@sheppakai/shared/cron';

import { runWeeklySummaryEmail } from '#lib/server/jobs/weeklySummaryEmail.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = createCronHandler({
	secret: CRON_SECRET,
	name: 'weekly summary email',
	run: runWeeklySummaryEmail,
	monitor: {
		slug: 'budget-weekly-summary',
		// Must match the cron line in .github/workflows/budget-weekly-cron.yml.
		schedule: '10 16 * * 1',
		// GitHub Actions scheduled runs are often 10–30 min late.
		checkinMargin: 30,
		maxRuntime: 10
	},
	logger
});
