import { CRON_SECRET } from '$app/env/private';
import { runWeeklySummaryEmail } from '$lib/server/jobs/weeklySummaryEmail';
import { logger } from '$lib/server/logger';
import { createCronHandler } from '@sheppakai/shared/cron';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = createCronHandler({
	secret: CRON_SECRET,
	name: 'weekly summary email',
	run: runWeeklySummaryEmail,
	logger
});
