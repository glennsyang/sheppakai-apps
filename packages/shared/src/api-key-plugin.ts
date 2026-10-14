// The better-auth API-key plugin as the apps with an /api/v1 surface (budget, synapse) run
// it. Separate from `auth-config` so apps without API keys never import the plugin.
import { apiKey } from '@better-auth/api-key';

export function createApiKeyPlugin() {
	return apiKey({
		references: 'user',
		storage: 'database',
		requireName: true,
		// Only ever verified explicitly via auth.api.verifyApiKey (each app's `requireApiKey`).
		// Never let a valid API key stand in for a session on the app's own cookie-based routes.
		enableSessionForAPIKeys: false,
		keyExpiration: {
			minExpiresIn: 1,
			maxExpiresIn: 365
		},
		rateLimit: {
			enabled: true,
			timeWindow: 60 * 1000, // 1 minute
			maxRequests: 100
		}
	});
}
