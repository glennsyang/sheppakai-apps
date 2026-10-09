import { z } from 'zod';

// Build-time placeholders. `vite build` runs without secrets, so each guarded variable
// accepts anything while building and falls back to its placeholder. At runtime the
// placeholder is rejected, so a deploy that is missing a secret fails at startup instead
// of running with a known dummy value.
export const DUMMY_ENV = {
	DATABASE_URL: 'file:///tmp/build.db',
	BETTER_AUTH_SECRET: 'build_time_dummy_secret_min_32_chars_long',
	BETTER_AUTH_BASE_URL: 'http://localhost:5173',
	BREVO_API_KEY: 'build_time_dummy_key',
	BREVO_FROM_ADDRESS: 'noreply@example.com',
	ADMIN_USER_IDS: 'dummy_admin_id',
	CRON_SECRET: 'build_time_dummy_secret_min_16_chars'
} as const;

/**
 * `building ? placeholder : runtime schema that rejects the placeholder`. The refine runs
 * whenever the app is not building: in dev, in tests and in production.
 */
function guarded<T extends z.ZodType<string>>(
	building: boolean,
	name: keyof typeof DUMMY_ENV,
	runtime: T
) {
	const dummy = DUMMY_ENV[name];
	return building
		? z.string().catch(dummy)
		: runtime.refine((value) => value !== dummy, {
				message: `${name} cannot be the build-time placeholder value`
			});
}

/**
 * The env entries every app shares, for spreading into each app's `defineEnvVars({...})`
 * in `src/env.ts`. App-only variables (CRON_SECRET, SENTRY_DSN, the other alert URLs, AI
 * keys) stay in the app.
 */
export function sharedEnvVars(building: boolean) {
	return {
		DATABASE_URL: {
			description: 'SQLite database file path (e.g. file://data/app.db)',
			schema: guarded(building, 'DATABASE_URL', z.string().min(1))
		},
		BETTER_AUTH_SECRET: {
			description: 'Secret key for Better Auth session signing (minimum 32 characters)',
			schema: guarded(building, 'BETTER_AUTH_SECRET', z.string().min(32))
		},
		BETTER_AUTH_BASE_URL: {
			description: 'Base URL for Better Auth callbacks and password reset redirects',
			// The placeholder is a real local URL, so it isn't refined away: dev uses it.
			schema: building ? z.string().catch(DUMMY_ENV.BETTER_AUTH_BASE_URL) : z.url()
		},
		BREVO_API_KEY: {
			description: 'Brevo API key for sending transactional emails',
			schema: guarded(building, 'BREVO_API_KEY', z.string().min(1))
		},
		BREVO_FROM_ADDRESS: {
			description:
				'From address for outgoing transactional emails (must be a confirmed Brevo sender)',
			schema: guarded(building, 'BREVO_FROM_ADDRESS', z.email())
		},
		ADMIN_USER_IDS: {
			description:
				'Comma-separated list of user IDs bootstrapped as admins by the better-auth admin plugin',
			schema: guarded(building, 'ADMIN_USER_IDS', z.string().min(1))
		},
		ALLOWED_EMAILS: {
			description:
				'Comma-separated list of the only emails allowed to sign in (exact, case-insensitive match)',
			schema: building ? z.string().catch('') : z.string().min(1)
		},
		AUTH_ALERTS_URL: {
			description:
				'Ntfy.sh URL for authentication and security alert push notifications. Defaults to a ' +
				'non-resolving .invalid host so alerts are disabled (not sent anywhere) until set.',
			// RFC 6761 reserved TLD — guaranteed not to resolve. Each app's sendAuthAlerts
			// skips any `.invalid` host, so an unconfigured deployment fails closed instead of
			// POSTing alert text (which can include a user's email) to a live third-party domain.
			schema: z.url().default('https://auth-alerts.invalid')
		},
		NODE_ENV: {
			description: 'Application runtime environment',
			schema: z.enum(['development', 'production', 'test']).default('development')
		},
		LOG_LEVEL: {
			description:
				'Minimum log level to emit (debug, info, warn, error); defaults to debug in dev, info in prod',
			schema: z.enum(['debug', 'info', 'warn', 'error']).optional()
		}
	};
}

/**
 * `CRON_SECRET`, for the apps with `/api/cron/*` routes (budget, synapse). Spread it into
 * `defineEnvVars` next to `sharedEnvVars`. The same value is also a GitHub Actions secret.
 */
export function cronSecretEnvVar(building: boolean) {
	return {
		CRON_SECRET: {
			description:
				'Bearer token for authorizing cron job requests (minimum 16 characters). Must match ' +
				'the GitHub Actions secret of the same name.',
			schema: guarded(building, 'CRON_SECRET', z.string().min(16))
		}
	};
}
