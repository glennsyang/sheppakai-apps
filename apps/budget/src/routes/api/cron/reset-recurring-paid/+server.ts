import { CRON_SECRET } from '$app/env/private';
import { createCronHandler } from '@sheppakai/shared/cron';

import { runResetRecurringPaid } from '#lib/server/jobs/recurring.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = createCronHandler({
	secret: CRON_SECRET,
	name: 'reset recurring paid status',
	run: runResetRecurringPaid,
	logger
});
