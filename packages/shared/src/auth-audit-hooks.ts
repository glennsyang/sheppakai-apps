import { APIError, createAuthMiddleware } from 'better-auth/api';

import type { PasskeyAddedEmailPayload } from './email';

/**
 * Each app's side effects for the audit hooks. `sendNewUserEmail` and
 * `sendPasskeyAddedEmail` may reject (the hook catches and logs it); the others must
 * not throw.
 */
export interface AuthAuditDeps {
	logger: {
		info(message: string, meta?: Record<string, unknown>): void;
		error(message: string, error?: unknown): void;
	};
	sendNewUserEmail: (to: string, name: string) => unknown;
	sendPasskeyAddedEmail: (payload: PasskeyAddedEmailPayload) => unknown;
	sendAuthAlerts: (message: string, title: string, priority: number) => unknown;
	/** Absolute URL of the app's Profile page, linked from the "passkey added" email. */
	profileUrl: string;
}

/** The endpoint's own response, or undefined when it threw (an `APIError`) or returned nothing. */
function returnedRecord(returned: unknown): Record<string, unknown> | undefined {
	if (!returned || typeof returned !== 'object' || returned instanceof APIError) return undefined;
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowed to a non-null object above
	return returned as Record<string, unknown>;
}

/**
 * `hooks.after` observability for Better Auth.
 *
 * Path matching is exact, not `.includes(...)`: Better Auth's internal
 * endpoint paths are `/sign-up/email` and `/sign-in/email` (the app's own
 * `/register` and `/sign-in` SvelteKit routes never appear here — they call
 * `auth.api.signUpEmail`/`signInEmail` directly). `ctx.context.newSession` is
 * the correct accessor for the session just created by either endpoint;
 * `ctx.context.session` is only populated by session-*requiring* endpoints
 * and is never set here.
 */
export function createAuthAfterHooks(appName: string, deps: AuthAuditDeps) {
	const { logger, sendNewUserEmail, sendPasskeyAddedEmail, sendAuthAlerts, profileUrl } = deps;

	return createAuthMiddleware(async (ctx) => {
		if (ctx.path === '/sign-up/email') {
			const newSession = ctx.context.newSession;
			if (newSession) {
				// Not awaited, so sign-up isn't slowed by Brevo; a rejection is logged rather
				// than left unhandled (which would crash the process).
				Promise.resolve(sendNewUserEmail(newSession.user.email, newSession.user.name)).catch(
					(err) => logger.error('New user email failed', err)
				);
				void sendAuthAlerts(
					`New user registered: ${newSession.user.id}`,
					`${appName} - New User Alert`,
					4
				);
			}
		}
		if (ctx.path === '/sign-in/email' || ctx.path === '/passkey/verify-authentication') {
			const newSession = ctx.context.newSession;
			if (newSession) {
				logger.info('Sign-in successful', {
					email: newSession.user.email,
					ip: newSession.session.ipAddress,
					method: ctx.path === '/sign-in/email' ? 'password' : 'passkey'
				});
			}
		}
		if (ctx.path === '/passkey/verify-registration') {
			// Registration requires a session, so `ctx.context.session` is the user who added it.
			const passkey = returnedRecord(ctx.context.returned);
			const user = ctx.context.session?.user;
			if (passkey && user) {
				const deviceName = typeof passkey.name === 'string' && passkey.name ? passkey.name : null;
				logger.info('Passkey added', { userId: user.id, passkeyId: passkey.id });
				// Fire-and-forget, like the sign-up email: the passkey is already saved, so a
				// Brevo failure is logged rather than failing the registration.
				Promise.resolve(
					sendPasskeyAddedEmail({
						to: user.email,
						name: user.name || user.email,
						deviceName,
						addedAt: new Date(),
						profileUrl
					})
				).catch((err) => logger.error('Passkey added email failed', err));
				void sendAuthAlerts(`Passkey added for user ${user.id}`, `${appName} - Security Alert`, 4);
			}
		}
		if (ctx.path === '/passkey/delete-passkey') {
			const user = ctx.context.session?.user;
			if (returnedRecord(ctx.context.returned) && user) {
				const body: unknown = ctx.body;
				const passkeyId =
					body && typeof body === 'object' && 'id' in body ? String(body.id) : undefined;
				logger.info('Passkey removed', { userId: user.id, passkeyId });
			}
		}
	});
}

/**
 * Reset-password audit logging, called from `emailAndPassword.onPasswordReset`
 * rather than `hooks.after`: the `/reset-password` endpoint never populates
 * `ctx.context.session` or `ctx.context.newSession`, so `onPasswordReset`'s
 * `{ user }` argument is the only reliable source of who just reset their
 * password. It also fires exactly once, unlike a `hooks.after` path check
 * (which also matches the GET `/reset-password/:token` link-click callback).
 */
export function logPasswordResetAudit(
	user: { id: string; email: string },
	appName: string,
	deps: Pick<AuthAuditDeps, 'logger' | 'sendAuthAlerts'>
) {
	deps.logger.info('Security event: password reset completed and sessions revoked', {
		userId: user.id,
		email: user.email,
		timestamp: new Date().toISOString()
	});
	void deps.sendAuthAlerts(
		`Password reset completed for user ${user.id}`,
		`${appName} - Security Alert`,
		4
	);
}
