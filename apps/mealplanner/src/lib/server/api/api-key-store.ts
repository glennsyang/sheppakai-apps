import { createApiKeyStore } from '@sheppakai/shared/api-key-admin';

import { auth } from '../auth';
import { logger } from '../logger';

// Admin-wide API-key reads and writes (list every user's keys, revoke, disable on ban or
// demotion), through Better Auth's own adapter.
export const apiKeyStore = createApiKeyStore(auth, logger);
