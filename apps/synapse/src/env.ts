import { building } from '$app/env';
import { sharedEnvVars } from '@sheppakai/shared/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

export const variables = defineEnvVars({
	// DATABASE_URL, BETTER_AUTH_*, BREVO_*, ADMIN_USER_IDS, ALLOWED_EMAILS, AUTH_ALERTS_URL,
	// NODE_ENV and LOG_LEVEL, with the build-time placeholder guards.
	...sharedEnvVars(building),
	REMINDER_ALERTS_URL: {
		description: 'ntfy.sh topic URL for reminder push notifications',
		schema: building ? z.string().catch('https://ntfy.sh/placeholder') : z.url()
	},
	CRON_SECRET: {
		description: 'Bearer token for authorizing cron job requests',
		schema: building ? z.string().catch('build_time_dummy_secret_min_16_chars') : z.string().min(16)
	},
	FLY_APP_NAME: {
		description:
			'Fly app name, set automatically by Fly at runtime; used in the admin allowlist hint',
		schema: z.string().optional()
	},
	SENTRY_DSN: {
		description:
			'Sentry DSN, sent to the browser to initialize error tracking client-side. Not a secret — defaults to the project DSN so no config is required.',
		public: true,
		static: true,
		schema: z
			.url()
			.default(
				'https://0941b6e2d9801402928ec265ba858ff9@o4510809399492608.ingest.us.sentry.io/4511970268020736'
			)
	}
});
