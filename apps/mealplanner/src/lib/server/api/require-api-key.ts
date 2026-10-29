import { createRequireApiKey } from '@sheppakai/shared/api-key';
import { eq } from 'drizzle-orm';

// The shared API-key check, bound to this app's auth, scopes and user lookup. The owner
// rule (exists, not banned, allowlisted, admin) lives in @sheppakai/shared/api-key.
import type { ApiScope } from '#lib/api-scopes.js';
import { isAdminUser } from '#lib/server/actions/auth-guard.js';
import { allowedEmails, auth } from '#lib/server/auth/index.js';
import { getDb } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema/index.js';
import { logger } from '#lib/server/logger.js';

export const requireApiKey = createRequireApiKey<ApiScope>({
	verifyApiKey: (context) => auth.api.verifyApiKey(context),
	findOwner: async (userId) => getDb().select().from(user).where(eq(user.id, userId)).get(),
	allowedEmails,
	isAdminUser,
	logger
});
