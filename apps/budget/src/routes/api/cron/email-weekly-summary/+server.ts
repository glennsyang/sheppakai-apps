import { CRON_SECRET } from '$app/env/private';
import { createCronHandler } from '@sheppakai/shared/cron';

import { runWeeklySummaryEmail } from '#lib/server/jobs/weeklySummaryEmail.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = createCronHandler({
	secret: CRON_SECRET,
	name: 'weekly summary email',
	run: runWeeklySummaryEmail,
	logger
});
