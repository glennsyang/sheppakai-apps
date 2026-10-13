import { createRequireApiKey } from '@sheppakai/shared/api-key';

// The shared API-key check, bound to this app's auth, scopes and user lookup. The owner
// rule (exists, not banned, allowlisted, admin) lives in @sheppakai/shared/api-key.
import type { ApiScope } from '#lib/api-scopes.js';
import { userQueries } from '#lib/server/db/queries/index.js';
import { logger } from '#lib/server/logger.js';

import { isAdminUser } from '../admin-status';
import { allowedEmails, auth } from '../auth';

export const requireApiKey = createRequireApiKey<ApiScope>({
	verifyApiKey: (context) => auth.api.verifyApiKey(context),
	findOwner: (userId) => userQueries.findById(userId, false),
	allowedEmails,
	isAdminUser,
	logger
});
