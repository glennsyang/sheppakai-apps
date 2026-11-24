import { suggestVariationsSchema } from '#lib/schemas/mealPlan.js';
import { createAiEndpoint, sessionCaller } from '#lib/server/ai/endpoint.js';
import { suggest } from '#lib/server/suggestions/index.js';

export const POST = createAiEndpoint({
	caller: sessionCaller,
	schema: suggestVariationsSchema,
	run: ({ meal }) => suggest({ kind: 'variation', of: meal }),
	label: 'Variations API',
	failMessage: 'Failed to generate variations'
});
