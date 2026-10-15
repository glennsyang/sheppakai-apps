import { suggestFromPantrySchema } from '#lib/schemas/pantry.js';
import { createAiEndpoint } from '#lib/server/ai/endpoint.js';
import { suggestMeals } from '#lib/server/ai/gemini.js';

export const POST = createAiEndpoint({
	schema: suggestFromPantrySchema,
	run: ({ items }) => suggestMeals(items),
	label: 'Suggest API',
	failMessage: 'Failed to generate suggestions'
});
