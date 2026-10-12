import {
	ADMIN_USER_IDS,
	ALLOWED_EMAILS,
	BETTER_AUTH_BASE_URL,
	BETTER_AUTH_SECRET,
	NODE_ENV
} from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { logger } from '$lib/server/logger';
import { apiKey } from '@better-auth/api-key';
import { parseAllowedEmails } from '@sheppakai/shared/auth-allowlist';
import { createAppAuth } from '@sheppakai/shared/auth-config';
import { eq } from 'drizzle-orm';

import { getDb } from './db';
import * as schema from './db/schema';
import {
	sendNewUserEmail,
	sendPasswordChangedEmail,
	sendPasswordResetEmail,
	sendVerificationEmail
} from './email';
import { sendAuthAlerts } from './notifications';

export const allowedEmails = parseAllowedEmails(ALLOWED_EMAILS);

// Shared config (invite-only, allowlist gates, hashed tokens, HIBP, rate limits) lives in
// @sheppakai/shared/auth-config; this app adds the API-key plugin behind /api/v1.
export const auth = createAppAuth({
	appName: 'Synapse',
	cookiePrefix: 'synapse_auth_',
	secret: BETTER_AUTH_SECRET,
	baseURL: BETTER_AUTH_BASE_URL,
	nodeEnv: NODE_ENV,
	adminUserIds: ADMIN_USER_IDS,
	allowedEmails,
	db: getDb(),
	tables: {
		user: schema.user,
		session: schema.session,
		account: schema.account,
		verification: schema.verification,
		apikey: schema.apiKey,
		rateLimit: schema.rateLimit
	},
	findUserEmail: async (userId) => {
		const [row] = await getDb()
			.select({ email: schema.user.email })
			.from(schema.user)
			.where(eq(schema.user.id, userId))
			.limit(1);
		return row?.email;
	},
	email: {
		sendPasswordResetEmail,
		sendVerificationEmail,
		sendPasswordChangedEmail,
		sendNewUserEmail
	},
	sendAuthAlerts,
	logger,
	getRequestEvent,
	plugins: [
		apiKey({
			references: 'user',
			storage: 'database',
			requireName: true,
			// Only ever verified explicitly via auth.api.verifyApiKey (see src/lib/server/api/require-api-key.ts).
			// Never let a valid API key stand in for a session on the app's own cookie-based routes.
			enableSessionForAPIKeys: false,
			keyExpiration: {
				minExpiresIn: 1,
				maxExpiresIn: 365
			},
			rateLimit: {
				enabled: true,
				timeWindow: 60 * 1000, // 1 minute
				maxRequests: 100
			}
		})
	]
});
