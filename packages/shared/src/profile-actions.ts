// Profile page actions (change name, change password), shared by every app. Each app binds
// its own auth instance, password-changed email and logger once, in its profile
// `+page.server.ts`, and spreads the result into `actions`.

import type { RequestEvent } from '@sveltejs/kit';
import { isRedirect } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';

import { invalidAuthForm as invalidForm } from './auth-form-handler';
import { requireAuth } from './auth-guard';
import { changePasswordSchema, updateNameSchema } from './auth-schemas';
import { createUserRateLimiter, rateLimitedMessage } from './rate-limiter';

type PasswordChangedEmailPayload = {
	to: string;
	name: string;
	changedAt: Date;
	ipAddress?: string;
	userAgent?: string;
	source?: string;
};

/** The better-auth endpoints these actions call. */
interface ProfileAuthApi {
	updateUser(ctx: { body: { name: string }; headers: Headers }): Promise<unknown>;
	changePassword(ctx: {
		body: { currentPassword: string; newPassword: string; revokeOtherSessions: boolean };
		headers: Headers;
	}): Promise<unknown>;
}

export interface ProfileActionsDeps {
	auth: { api: ProfileAuthApi };
	sendPasswordChangedEmail: (payload: PasswordChangedEmailPayload) => Promise<unknown>;
	/** Maps a Better Auth error to user-facing text, or returns `fallback`. */
	getErrorMessage: (error: unknown, fallback: string) => string;
	logger: {
		info(message: string, meta?: Record<string, unknown>): void;
		error(message: string, error?: unknown): void;
	};
}

/**
 * Real client IP for the security-audit log and the password-changed email. Not
 * X-Forwarded-For: its first entry is client-supplied, so a hijacked session could make the
 * alert show a familiar IP. `getClientAddress()` reads the proxy-set Fly-Client-IP
 * (`ADDRESS_HEADER` in fly.toml) and throws when it is missing; then no IP is recorded.
 */
function getClientIp(event: RequestEvent): string | undefined {
	try {
		return event.getClientAddress() || undefined;
	} catch {
		return undefined;
	}
}

export function createProfileActions(deps: ProfileActionsDeps) {
	const { auth, logger, getErrorMessage } = deps;

	// Keyed by user id (not IP): this is an authenticated action, and the current-password
	// check is the thing worth rate limiting against brute-forcing.
	const changePasswordLimiter = createUserRateLimiter([5, 'm']);

	return {
		updateName: requireAuth(async ({ request }, user) => {
			const form = await superValidate(request, zod4(updateNameSchema));
			if (!form.valid) {
				return invalidForm(form);
			}

			try {
				// Through better-auth, not a direct DB write, so its user-update hooks (name length
				// guard), updatedAt stamping and session cookie refresh all apply.
				await auth.api.updateUser({ body: { name: form.data.name }, headers: request.headers });
				logger.info('Profile name updated', { userId: user.id });
			} catch (error) {
				if (isRedirect(error)) throw error;
				logger.error('Profile name update failed', error);
				return message(
					form,
					{
						type: 'error',
						text: getErrorMessage(error, 'Failed to update name. Please try again.')
					},
					{ status: 500 }
				);
			}

			return message(form, { type: 'success', text: 'Name updated.' });
		}),

		changePassword: requireAuth(async (event, user) => {
			const { request } = event;
			const form = await superValidate(request, zod4(changePasswordSchema));
			if (!form.valid) {
				return invalidForm(form);
			}

			const rateLimitStatus = await changePasswordLimiter.check(event, { userId: user.id });
			if (rateLimitStatus.limited) {
				return rateLimitedMessage(form, rateLimitStatus.retryAfter);
			}

			const ipAddress = getClientIp(event);
			const userAgent = request.headers.get('user-agent') || undefined;

			try {
				await auth.api.changePassword({
					body: {
						currentPassword: form.data.currentPassword,
						newPassword: form.data.newPassword,
						revokeOtherSessions: true
					},
					headers: request.headers
				});
			} catch (error) {
				if (isRedirect(error)) throw error;
				logger.error('Password change failed', error);
				return message(
					form,
					{
						type: 'error',
						text: getErrorMessage(error, 'Current password is incorrect or password change failed.')
					},
					{ status: 400 }
				);
			}

			logger.info('Security event: password changed and other sessions revoked', {
				userId: user.id,
				ipAddress,
				userAgent
			});

			// Fire-and-forget: the change has already succeeded, so a failing confirmation email
			// must not turn it into an error.
			void deps
				.sendPasswordChangedEmail({
					to: user.email,
					name: user.name || user.email,
					changedAt: new Date(),
					ipAddress,
					userAgent,
					source: 'Profile settings'
				})
				.catch((error: unknown) => logger.error('Password changed email failed', error));

			return message(form, { type: 'success', text: 'Password changed successfully.' });
		})
	};
}
