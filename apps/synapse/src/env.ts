import { building } from '$app/env';
import { cronSecretEnvVar, sharedEnvVars } from '@sheppakai/shared/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

export const variables = defineEnvVars({
	// DATABASE_URL, BETTER_AUTH_*, BREVO_*, ADMIN_USER_IDS, ALLOWED_EMAILS, AUTH_ALERTS_URL,
	// NODE_ENV and LOG_LEVEL, with the build-time placeholder guards.
	...sharedEnvVars(building),
	...cronSecretEnvVar(building),
	REMINDER_ALERTS_URL: {
		description: 'ntfy.sh topic URL for reminder push notifications',
		schema: building ? z.string().catch('https://ntfy.sh/placeholder') : z.url()
	},
	BUDGET_API_URL: {
		description:
			'Budget app base URL (e.g. https://budget.example.com). With BUDGET_API_KEY, the morning digest ' +
			'lists bills due this week; unset skips that section.',
		schema: z.url().optional()
	},
	BUDGET_API_KEY: {
		description: 'Budget /api/v1 key with the recurring:read scope, for the morning digest.',
		schema: z.string().optional()
	},
	MEALPLANNER_API_URL: {
		description:
			"Mealplanner app base URL. With MEALPLANNER_API_KEY, the morning digest shows tonight's dinner; " +
			'unset skips that section.',
		schema: z.url().optional()
	},
	MEALPLANNER_API_KEY: {
		description: 'Mealplanner /api/v1 key with the plans:read scope, for the morning digest.',
		schema: z.string().optional()
	},
	MEAL_ESTIMATE_PROVIDER: {
		description:
			'AI provider that estimates meal calories from a photo or description in Log Meal: ' +
			"gemini or claude. Estimating is off (buttons hidden) until the chosen provider's API key is set.",
		schema: z.enum(['gemini', 'claude']).default('gemini')
	},
	GEMINI_API_KEY: {
		description: 'Google AI Studio API key, used when MEAL_ESTIMATE_PROVIDER=gemini.',
		schema: z.string().optional()
	},
	GEMINI_MEAL_MODEL: {
		description: 'Gemini model for meal estimates.',
		schema: z.string().min(1).default('gemini-3-flash-preview')
	},
	ANTHROPIC_API_KEY: {
		description: 'Anthropic API key, used when MEAL_ESTIMATE_PROVIDER=claude.',
		schema: z.string().optional()
	},
	CLAUDE_MEAL_MODEL: {
		description: 'Claude model for meal estimates.',
		schema: z.string().min(1).default('claude-haiku-5-5')
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
