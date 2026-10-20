import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, haveIBeenPwned } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';

import { createAllowlistBeforeHook, createAllowlistSessionGuard } from './auth-allowlist';
import { createAuthAfterHooks, logPasswordResetAudit } from './auth-audit-hooks';
import { assertNameLength } from './name-guard';

type DrizzleDb = Parameters<typeof drizzleAdapter>[0];
type PasswordChangedEmailPayload = {
	to: string;
	name: string;
	changedAt: Date;
	source?: string;
};
type SendAuthAlerts = (message: string, title: string, priority: number) => unknown;

export interface AppAuthConfig<Extra extends BetterAuthPlugin[]> {
	/** Shown in emails and operator alerts, e.g. 'Sheppakai Budget'. */
	appName: string;
	/** Keeps each app's cookies apart when they share a parent domain. */
	cookiePrefix: string;
	secret: string;
	baseURL: string;
	nodeEnv: string | undefined;
	/** Comma-separated `ADMIN_USER_IDS`. */
	adminUserIds: string;
	allowedEmails: Set<string>;
	db: DrizzleDb;
	/** Drizzle tables keyed by Better Auth model name (user, session, account, …). */
	tables: Record<string, unknown>;
	email: {
		sendPasswordResetEmail: (to: string, name: string, url: string) => Promise<unknown>;
		sendVerificationEmail: (to: string, name: string, url: string) => Promise<unknown>;
		sendPasswordChangedEmail: (payload: PasswordChangedEmailPayload) => Promise<unknown>;
		sendNewUserEmail: (to: string, name: string) => unknown;
	};
	sendAuthAlerts: SendAuthAlerts;
	logger: {
		debug(message: string, meta?: unknown): void;
		info(message: string, meta?: Record<string, unknown>): void;
		error(message: string, error?: unknown): void;
	};
	/** SvelteKit's `getRequestEvent` from `$app/server`, for the cookie plugin. */
	getRequestEvent: Parameters<typeof sveltekitCookies>[0];
	/** App-specific plugins, added before the SvelteKit cookie plugin (which must be last). */
	plugins?: Extra;
}

/**
 * The Better Auth instance every app runs: invite-only email + password, an
 * ALLOWED_EMAILS gate on sign-in and on every session-creating flow, hashed tokens,
 * HIBP-checked passwords and no session cookie cache. Apps differ only in name,
 * cookie prefix and extra plugins (e.g. API keys).
 */
export function createAppAuth<const Extra extends BetterAuthPlugin[] = []>(
	config: AppAuthConfig<Extra>
) {
	const { appName, allowedEmails, email, sendAuthAlerts, logger } = config;
	const auditDeps = { logger, sendNewUserEmail: email.sendNewUserEmail, sendAuthAlerts };

	// The session guard needs the user's email, read through Better Auth's own adapter. The
	// instance only exists after `betterAuth()` returns, so the lookup is bound just below.
	const userLookup = {
		findEmail: async (_userId: string): Promise<string | undefined> => undefined
	};

	const auth = betterAuth({
		appName,
		secret: config.secret,
		baseURL: config.baseURL,
		// Every app maps `rateLimit` here because rateLimit.storage is 'database' in production
		// (see below). Without that mapping better-auth has nowhere to persist per-IP counters
		// and DB-backed rate limiting silently no-ops.
		database: drizzleAdapter(config.db, { provider: 'sqlite', schema: config.tables }),
		verification: {
			// Store reset/verification tokens hashed so a DB dump or leaked query log can't
			// be replayed to take over an account.
			storeIdentifier: 'hashed'
		},
		emailAndPassword: {
			enabled: true,
			// Accounts are created by an admin only (Admin → Users → Add user).
			disableSignUp: true,
			autoSignIn: false,
			requireEmailVerification: true,
			minPasswordLength: 12,
			maxPasswordLength: 128,
			// A reset is the recovery path for a suspected-compromised account, so no
			// existing session may survive it.
			revokeSessionsOnPasswordReset: true,
			resetPasswordTokenExpiresIn: 60 * 10, // 10 minutes
			sendResetPassword: async ({ user, url }) => {
				// `url` is Better Auth's own GET-verifier link
				// (/api/auth/reset-password/<token>?callbackURL=...). Pass it straight
				// through — its own originCheck middleware already validated
				// callbackURL against trustedOrigins, and the verifier itself checks
				// the token before redirecting to /reset-password.
				//
				// Await the send (don't fire-and-forget): it throws on failure, and letting that
				// propagate keeps the send tied to the request lifecycle (Fly can suspend the
				// machine as soon as the response returns) and surfaces delivery failures in the
				// logs / Sentry instead of a silent "link sent" with no email.
				await email.sendPasswordResetEmail(user.email, user.name || user.email, url);
				void sendAuthAlerts(
					`Password reset requested for user ${user.id}`,
					`${appName} - Password Reset Alert`,
					4
				);
			},
			onPasswordReset: async ({ user }) => {
				logPasswordResetAudit(user, appName, auditDeps);
				// Fire-and-forget: the reset has already succeeded, so a failing confirmation
				// email must not break the response.
				void email
					.sendPasswordChangedEmail({
						to: user.email,
						name: user.name || user.email,
						changedAt: new Date(),
						source: 'Password reset flow'
					})
					.catch((err: unknown) => logger.error('Password changed email failed', err));
			}
		},
		emailVerification: {
			// Explicit so the "expires in 1 hour" email copy stays true (Better Auth default is also 3600s).
			expiresIn: 60 * 60, // 1 hour
			sendOnSignUp: true,
			// Without this, better-auth only sends the verification email once, on sign-up, and
			// a user who missed that email (or let it expire) hits a dead end: sign-in throws
			// EMAIL_NOT_VERIFIED and /verify-email claims a link was sent when none was.
			sendOnSignIn: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				logger.debug('✉️ Sending verification email');
				// `url` is already the complete verification link (token + callbackURL);
				// appending `?token=` again produced a malformed double-`?` URL.
				// Awaited for the same reason as the reset email above.
				await email.sendVerificationEmail(user.email, user.name || user.email, url);
			}
		},
		hooks: {
			// Public sign-up is off (disableSignUp above); this also restricts sign-in to
			// the exact ALLOWED_EMAILS list.
			before: createAllowlistBeforeHook(appName, allowedEmails, { sendAlert: sendAuthAlerts }),
			after: createAuthAfterHooks(appName, auditDeps)
		},
		databaseHooks: {
			user: {
				create: { before: assertNameLength },
				update: { before: assertNameLength }
			},
			session: {
				create: {
					// Backstop for every session-creating flow (sign-in, verify-email auto sign-in,
					// impersonation, …), not just the paths hooks.before sees.
					before: createAllowlistSessionGuard(allowedEmails, (userId) =>
						userLookup.findEmail(userId)
					)
				}
			}
		},
		advanced: {
			cookiePrefix: config.cookiePrefix,
			useSecureCookies: true,
			ipAddress: {
				disableIpTracking: false,
				// Fly.io's edge sets fly-client-ip on every request and strips any client-supplied
				// value, so it wins whenever present. The rest are client-forwardable and only a
				// fallback for non-Fly contexts; if the apps ever leave Fly, configure
				// advanced.ipAddress.trustedProxies instead of relying on header order.
				ipAddressHeaders: ['fly-client-ip', 'x-forwarded-for', 'x-real-ip', 'x-client-ip']
			},
			database: {
				generateId: () => crypto.randomUUID()
			}
		},
		session: {
			expiresIn: 60 * 60 * 24 * 7, // 7 days
			updateAge: 60 * 60 * 24, // Update every 24 hours
			// No cookie cache: getSession checks the session row on every request, so a
			// password change/reset, ban, removal or role change takes effect on the next
			// request instead of after the cache expires. On local SQLite the extra read is
			// negligible.
			cookieCache: {
				enabled: false
			}
		},
		trustedOrigins: [
			new URL(config.baseURL).origin,
			...(config.nodeEnv === 'development' ? ['http://localhost:5173'] : [])
		],
		rateLimit: {
			enabled: true,
			window: 60, // 1 minute
			max: 5, // max 5 requests per window per IP
			storage: config.nodeEnv === 'production' ? 'database' : 'memory'
		},
		plugins: [
			// User administration: adds `role` / `banned` / `banReason` / `banExpires` to `user`
			// and the `auth.api.listUsers` / `setRole` / `banUser` / `unbanUser` / `removeUser`
			// endpoints. `adminUserIds` bootstraps admins by id from ADMIN_USER_IDS; the role
			// options are the plugin defaults, spelled out so the policy is visible.
			admin({
				adminUserIds: config.adminUserIds.split(','),
				defaultRole: 'user',
				adminRoles: ['admin']
			}),
			// NIST SP 800-63B §5.1.1.2: reject passwords found in a known-breach corpus.
			// Checked via the HIBP k-anonymity range API on the plugin's default paths
			// (/sign-up/email, /change-password, /reset-password, /admin/set-user-password)
			// — only the first 5 hex chars of the password's SHA-1 hash ever leave the
			// server. Fails closed: an HIBP outage blocks the password change rather than
			// silently skipping the check.
			haveIBeenPwned(),
			// Keeps the `Extra` tuple in betterAuth's inferred plugin list; `[]` only stands in when
			// `Extra` is its `[]` default.
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `?? []` widens away from Extra
			...((config.plugins ?? []) as Extra),
			sveltekitCookies(config.getRequestEvent) // must stay the last plugin
		]
	});

	userLookup.findEmail = async (userId) => {
		const { internalAdapter } = await auth.$context;
		return (await internalAdapter.findUserById(userId))?.email;
	};

	return auth;
}
