import { DATABASE_URL, NODE_ENV } from '$app/env/private';
import { logger } from '$lib/server/logger';
import { createGetDb } from '@sheppakai/shared/db';

import * as schema from './schema';

export const getDb = createGetDb({
	url: DATABASE_URL,
	schema,
	logger,
	queryLogging: NODE_ENV !== 'production'
});
