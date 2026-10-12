import { CRON_SECRET } from '$app/env/private';
import { runResetRecurringPaid } from '$lib/server/jobs/recurring';
import { logger } from '$lib/server/logger';
import { createCronHandler } from '@sheppakai/shared/cron';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = createCronHandler({
	secret: CRON_SECRET,
	name: 'reset recurring paid status',
	run: runResetRecurringPaid,
	logger
});
