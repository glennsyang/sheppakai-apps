import { getDb } from '$lib/server/db';
import { logger } from '$lib/server/logger';
import { createHealthzHandler } from '@sheppakai/shared/healthz';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = createHealthzHandler({ getDb, logger });
