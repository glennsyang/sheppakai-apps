import { suggestFromPantrySchema } from '#lib/schemas/pantry.js';
import { createAiEndpoint } from '#lib/server/ai/endpoint.js';
import { suggestMeals } from '#lib/server/ai/gemini.js';
import { getSuggestionHistory } from '#lib/server/services/suggestionHistory.js';

export const POST = createAiEndpoint({
	schema: suggestFromPantrySchema,
	run: async ({ items }) => suggestMeals(items, await getSuggestionHistory(new Date())),
	label: 'Suggest API',
	failMessage: 'Failed to generate suggestions'
});
