import { createAuthMiddleware } from 'better-auth/api';

/**
 * Each app's side effects for the audit hooks. `sendNewUserEmail` may reject (the
 * hook catches and logs it); the others must not throw.
 */
export interface AuthAuditDeps {
	logger: {
		info(message: string, meta?: Record<string, unknown>): void;
		error(message: string, error?: unknown): void;
	};
	sendNewUserEmail: (to: string, name: string) => unknown;
	sendAuthAlerts: (message: string, title: string, priority: number) => unknown;
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
	const { logger, sendNewUserEmail, sendAuthAlerts } = deps;

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
					`New user registered: ${newSession.user.email}`,
					`${appName} - New User Alert`,
					4
				);
			}
		}
		if (ctx.path === '/sign-in/email') {
			const newSession = ctx.context.newSession;
			if (newSession) {
				logger.info('Sign-in successful', {
					email: newSession.user.email,
					ip: newSession.session.ipAddress
				});
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
		`Password reset completed for ${user.email}`,
		`${appName} - Security Alert`,
		4
	);
}
