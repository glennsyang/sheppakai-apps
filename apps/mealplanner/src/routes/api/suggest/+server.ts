import { suggestFromPantrySchema } from '#lib/schemas/pantry.js';
import { createAiEndpoint, sessionCaller } from '#lib/server/ai/endpoint.js';
import { suggest } from '#lib/server/suggestions/index.js';

export const POST = createAiEndpoint({
	caller: sessionCaller,
	schema: suggestFromPantrySchema,
	run: ({ items }) => suggest({ kind: 'pantry', items }),
	label: 'Suggest API',
	failMessage: 'Failed to generate suggestions'
});
