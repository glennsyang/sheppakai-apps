import {
	ADMIN_USER_IDS,
	ALLOWED_EMAILS,
	BETTER_AUTH_BASE_URL,
	BETTER_AUTH_SECRET,
	NODE_ENV
} from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { parseAllowedEmails } from '@sheppakai/shared/auth-allowlist';
import { createAppAuth } from '@sheppakai/shared/auth-config';
import { eq } from 'drizzle-orm';

import { getDb } from '../db';
import * as schema from '../db/schema';
import {
	sendNewUserEmail,
	sendPasswordChangedEmail,
	sendPasswordResetEmail,
	sendVerificationEmail
} from '../email';
import { logger } from '../logger';
import { sendAuthAlerts } from '../notifications';

export const allowedEmails = parseAllowedEmails(ALLOWED_EMAILS);

// Shared config (invite-only, allowlist gates, hashed tokens, HIBP, rate limits) lives in
// @sheppakai/shared/auth-config.
export const auth = createAppAuth({
	appName: 'Meal Planner',
	cookiePrefix: 'mealplanner_auth_',
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
	getRequestEvent
});

// Session shapes with every plugin's additional fields folded in (the `admin` plugin adds
// `role` / `banned` / … to `user`). Used for `App.Locals` and component props so the app has
// one source of truth for the authenticated-user type.
export type SessionUser = typeof auth.$Infer.Session.user;
export type SessionData = typeof auth.$Infer.Session.session;
