import { building } from '$app/env';
import { cronSecretEnvVar, sharedEnvVars } from '@sheppakai/shared/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

export const variables = defineEnvVars({
	// DATABASE_URL, BETTER_AUTH_*, BREVO_*, ADMIN_USER_IDS, ALLOWED_EMAILS, AUTH_ALERTS_URL,
	// NODE_ENV and LOG_LEVEL, with the build-time placeholder guards.
	...sharedEnvVars(building),
	...cronSecretEnvVar(building),
	BUDGET_ALERTS_URL: {
		description:
			'Ntfy.sh URL for budget threshold alert push notifications. Defaults to a ' +
			'non-resolving .invalid host so alerts are disabled until set.',
		schema: z.url().default('https://budget-alerts.invalid')
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
