import { createRequireApiKey } from '@sheppakai/shared/api-key';
import { eq } from 'drizzle-orm';

// The shared API-key check, bound to this app's auth, scopes and user lookup. The owner
// rule (exists, not banned, allowlisted, admin) lives in @sheppakai/shared/api-key.
import type { ApiScope } from '#lib/api-scopes.js';
import { getDb } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema/index.js';
import { logger } from '#lib/server/logger.js';

import { isAdminUser } from '../actions/auth-guard';
import { allowedEmails, auth } from '../auth';

async function findOwner(userId: string) {
	const [owner] = await getDb()
		.select({
			id: user.id,
			email: user.email,
			role: user.role,
			banned: user.banned,
			banExpires: user.banExpires
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return owner;
}

export const requireApiKey = createRequireApiKey<ApiScope>({
	verifyApiKey: (context) => auth.api.verifyApiKey(context),
	findOwner,
	allowedEmails,
	isAdminUser,
	logger
});
