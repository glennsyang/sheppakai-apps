// Welcome email for an account an admin created. Shared by every app; each app binds its own
// auth instance, base URL and email template once, in `#lib/server/auth/welcome`.

import { randomBytes } from 'node:crypto';

import { RESET_PASSWORD_ROUTE, SIGN_IN_ROUTE } from './auth-routes';

// Far longer than the 10-minute reset link: a welcome email may sit unread for a day or two.
export const WELCOME_LINK_TTL_MS = 72 * 60 * 60 * 1000;

/** What every app's welcome-email template receives. */
export interface WelcomeEmailPayload {
	to: string;
	name: string;
	setPasswordUrl: string;
	signInUrl: string;
}

/** The slice of a better-auth instance needed to mint a reset-password token. */
interface WelcomeAuth {
	$context: Promise<{
		internalAdapter: {
			createVerificationValue(data: {
				identifier: string;
				value: string;
				expiresAt: Date;
			}): Promise<unknown>;
		};
	}>;
}

export interface WelcomeSenderDeps {
	auth: WelcomeAuth;
	/** `BETTER_AUTH_BASE_URL`. */
	baseUrl: string;
	/** The app's welcome-email template. Throws when the send fails. */
	sendWelcomeEmail: (payload: WelcomeEmailPayload) => Promise<void>;
}

/**
 * Returns `sendWelcome(user)`, for `createAdminUserActions({ sendWelcome })`. It mints a
 * set-password link and sends the welcome email, and throws if the send fails.
 *
 * The link is a standard better-auth reset-password token (the same `reset-password:<token>`
 * verification row that `requestPasswordReset` writes), so it goes through better-auth's own
 * GET verifier and the existing `/reset-password` page. Only the expiry differs.
 */
export function createWelcomeSender({ auth, baseUrl, sendWelcomeEmail }: WelcomeSenderDeps) {
	async function createWelcomePasswordLink(userId: string): Promise<string> {
		const token = randomBytes(24).toString('base64url');
		const ctx = await auth.$context;
		await ctx.internalAdapter.createVerificationValue({
			identifier: `reset-password:${token}`,
			value: userId,
			expiresAt: new Date(Date.now() + WELCOME_LINK_TTL_MS)
		});
		return `${baseUrl}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(RESET_PASSWORD_ROUTE)}`;
	}

	return async function sendWelcome(user: { id: string; email: string; name: string }) {
		const setPasswordUrl = await createWelcomePasswordLink(user.id);
		await sendWelcomeEmail({
			to: user.email,
			name: user.name,
			setPasswordUrl,
			signInUrl: `${baseUrl}${SIGN_IN_ROUTE}`
		});
	};
}
