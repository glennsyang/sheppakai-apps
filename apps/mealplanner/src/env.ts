import { building } from '$app/env';
import { sharedEnvVars } from '@sheppakai/shared/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

export const variables = defineEnvVars({
	// DATABASE_URL, BETTER_AUTH_*, BREVO_*, ADMIN_USER_IDS, ALLOWED_EMAILS, AUTH_ALERTS_URL,
	// NODE_ENV and LOG_LEVEL, with the build-time placeholder guards.
	...sharedEnvVars(building),
	ANTHROPIC_API_KEY: {
		description: 'Anthropic API key',
		schema: z.string().min(1).default('dummy_key_for_build')
	},
	GEMINI_API_KEY: {
		description: 'Gemini API key',
		schema: z.string().min(1).default('dummy_key_for_build')
	},
	SENTRY_DSN: {
		description:
			'Sentry DSN, sent to the browser to initialize error tracking client-side. Not a secret — defaults to the project DSN so no config is required.',
		public: true,
		static: true,
		schema: z
			.url()
			.default(
				'https://9488e2141b5fc14a91a545a6425e0422@o4510809399492608.ingest.us.sentry.io/4511412699725824'
			)
	}
});
