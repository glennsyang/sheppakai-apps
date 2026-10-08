import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

const DUMMY_DB_URL = 'file:///tmp/build.db';
const DUMMY_AUTH_SECRET = 'build_time_dummy_secret_min_32_chars_long';
const DUMMY_CRON_SECRET = 'dummy_cron_secret_for_build';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'SQLite database file path (e.g. data/mybudget.db)',
		schema: building
			? z.string().default(DUMMY_DB_URL)
			: z
					.string()
					.min(1)
					.refine((v) => v !== DUMMY_DB_URL, {
						message: 'Cannot use the build-time dummy DATABASE_URL'
					})
	},
	BETTER_AUTH_SECRET: {
		description: 'Secret key for Better Auth (minimum 32 characters)',
		schema: building
			? z.string().default(DUMMY_AUTH_SECRET)
			: z
					.string()
					.min(32)
					.refine((v) => v !== DUMMY_AUTH_SECRET, {
						message: 'Cannot use the build-time dummy BETTER_AUTH_SECRET'
					})
	},
	CRON_SECRET: {
		description: 'Secret token for authenticating cron job HTTP requests',
		schema: building ? z.string().default(DUMMY_CRON_SECRET) : z.string().min(1)
	},
	BETTER_AUTH_BASE_URL: {
		description: 'Base URL for Better Auth callbacks and password reset redirects',
		schema: z.url().default('http://localhost:5173')
	},
	BREVO_API_KEY: {
		description: 'Brevo API key for sending transactional emails',
		schema: building ? z.string().catch('build_time_dummy_key') : z.string().min(1)
	},
	BREVO_FROM_ADDRESS: {
		description:
			'From address for outgoing transactional emails (must be a confirmed Brevo sender)',
		schema: building ? z.string().catch('noreply@example.com') : z.email()
	},
	ADMIN_USER_IDS: {
		description: 'Comma-separated list of hardcoded admin user IDs',
		schema: z.string().default('dummy_admin_id')
	},
	ALLOWED_EMAILS: {
		description:
			'Comma-separated list of the only emails allowed to sign in (exact, case-insensitive match)',
		schema: building ? z.string().default('') : z.string().min(1)
	},
	AUTH_ALERTS_URL: {
		description:
			'Ntfy.sh URL for authentication and security alert push notifications. Defaults to a ' +
			'non-resolving .invalid host so alerts are disabled (not sent anywhere) until set.',
		// RFC 6761 reserved TLD — guaranteed not to resolve. The senders in
		// lib/server/notifications skip any `.invalid` host, so an unconfigured deployment
		// fails closed instead of POSTing alert text (which can include a user's email) to
		// a live third-party domain.
		schema: z.url().default('https://auth-alerts.invalid')
	},
	BUDGET_ALERTS_URL: {
		description:
			'Ntfy.sh URL for budget threshold alert push notifications. Defaults to a ' +
			'non-resolving .invalid host so alerts are disabled until set.',
		schema: z.url().default('https://budget-alerts.invalid')
	},
	NODE_ENV: {
		description: 'Application runtime environment',
		schema: z.enum(['development', 'production', 'test']).default('development')
	},
	SENTRY_DSN: {
		description:
			'Sentry DSN, sent to the browser to initialize error tracking client-side. Not a secret — defaults to the project DSN so no config is required.',
		public: true,
		static: true,
		schema: z
			.url()
			.default(
				'https://fc093590cdb84cd23c74c0af71692560@o4510809399492608.ingest.us.sentry.io/4510809402638336'
			)
	}
});
