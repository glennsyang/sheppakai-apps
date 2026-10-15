import { suggestVariationsSchema } from '#lib/schemas/mealPlan.js';
import { suggestVariations } from '#lib/server/ai/claude.js';
import { createAiEndpoint } from '#lib/server/ai/endpoint.js';

export const POST = createAiEndpoint({
	schema: suggestVariationsSchema,
	run: ({ meal }) => suggestVariations(meal),
	label: 'Variations API',
	failMessage: 'Failed to generate variations'
});
