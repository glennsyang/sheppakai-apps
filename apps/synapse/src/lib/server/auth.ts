import {
	ADMIN_USER_IDS,
	ALLOWED_EMAILS,
	BETTER_AUTH_BASE_URL,
	BETTER_AUTH_SECRET,
	NODE_ENV
} from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { createApiKeyPlugin } from '@sheppakai/shared/api-key-plugin';
import { parseAllowedEmails } from '@sheppakai/shared/auth-allowlist';
import { createAppAuth } from '@sheppakai/shared/auth-config';

import { logger } from '#lib/server/logger.js';

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
	email: {
		sendPasswordResetEmail,
		sendVerificationEmail,
		sendPasswordChangedEmail,
		sendNewUserEmail
	},
	sendAuthAlerts,
	logger,
	getRequestEvent,
	plugins: [createApiKeyPlugin()]
});
