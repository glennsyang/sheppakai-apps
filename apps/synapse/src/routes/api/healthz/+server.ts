import { createHealthzHandler } from '@sheppakai/shared/healthz';

import { getDb } from '#lib/server/db/index.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = createHealthzHandler({ getDb, logger });
