import { apiError, apiSuccess } from '@sheppakai/shared/api-response';
import { parseJsonBody, parseQuery } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { toApiRecipe } from '#lib/server/api/recipes.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import {
	apiCreateRecipeSchema,
	apiRecipeListQuerySchema
} from '#lib/server/api/schemas/recipes.js';
import { logger } from '#lib/server/logger.js';
import { listRecipes, saveRecipe } from '#lib/server/services/recipes.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'recipes:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiRecipeListQuerySchema);
	if (!parsed.ok) return parsed.response;

	try {
		const recipes = await listRecipes(parsed.data);
		return apiSuccess(recipes.map(toApiRecipe));
	} catch (error) {
		logger.error('API: failed to list recipes', error);
		return apiError('internal_error', 'Failed to load recipes.', 500);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'recipes:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiCreateRecipeSchema);
	if (!parsed.ok) return parsed.response;

	const { ingredients, instructions, ...fields } = parsed.data;
	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'recipes:write'
		},
		async () =>
			toApiRecipe(
				// Recipes written through the API are the caller's own, never model output.
				await saveRecipe(auth.userId, {
					...fields,
					ingredientsJson: ingredients,
					instructionsJson: instructions,
					source: 'custom'
				})
			),
		{ successStatus: 201, failureMessage: 'Failed to create recipe' }
	);
};
