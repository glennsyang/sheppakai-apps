import { apiKeyCaller, createAiEndpoint } from '#lib/server/ai/endpoint.js';
import { apiSuggestionsSchema } from '#lib/server/api/schemas/suggestions.js';
import { suggest } from '#lib/server/suggestions/index.js';

// Same 10/min-per-caller limit as /api/suggest, keyed by API key, on top of the api-key
// plugin's general per-key limit.
export const POST = createAiEndpoint({
	caller: apiKeyCaller('suggest:write'),
	schema: apiSuggestionsSchema,
	run: ({ items }) => suggest({ kind: 'pantry', items }),
	label: 'API suggestions',
	failMessage: 'Failed to generate suggestions'
});
