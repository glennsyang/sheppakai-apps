import { apiError, apiSuccess } from '@sheppakai/shared/api-response';
import { ApiWriteError, parseJsonBody } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { toApiRecipe } from '#lib/server/api/recipes.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiUpdateRecipeSchema } from '#lib/server/api/schemas/recipes.js';
import { logger } from '#lib/server/logger.js';
import { deleteRecipe, getRecipe, updateRecipe } from '#lib/server/services/recipes.js';

import type { RequestHandler } from './$types';

const notFound = () => new ApiWriteError('not_found', 'Recipe not found.', 404);

export const GET: RequestHandler = async ({ request, params }) => {
	const auth = await requireApiKey(request, 'recipes:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	try {
		const recipe = await getRecipe(params.id);
		if (!recipe) return apiError('not_found', 'Recipe not found.', 404);
		return apiSuccess(toApiRecipe(recipe));
	} catch (error) {
		logger.error('API: failed to load recipe', error);
		return apiError('internal_error', 'Failed to load recipe.', 500);
	}
};

export const PATCH: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'recipes:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiUpdateRecipeSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'PATCH',
			path: url.pathname,
			action: 'recipes:write'
		},
		async () => {
			const existing = await getRecipe(params.id);
			if (!existing) throw notFound();
			const patch = parsed.data;
			// updateRecipe overwrites every content field, so merge the patch onto the current row.
			const updated = await updateRecipe(params.id, {
				name: patch.name ?? existing.name,
				description: patch.description ?? existing.description,
				ingredientsJson: patch.ingredients ?? existing.ingredientsJson,
				instructionsJson: patch.instructions ?? existing.instructionsJson,
				prepTimeMinutes: patch.prepTimeMinutes ?? existing.prepTimeMinutes,
				servings: patch.servings ?? existing.servings
			});
			return toApiRecipe(updated);
		},
		{ successStatus: 200, failureMessage: 'Failed to update recipe' }
	);
};

export const DELETE: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'recipes:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'DELETE',
			path: url.pathname,
			action: 'recipes:write'
		},
		async () => {
			if (!(await deleteRecipe(params.id))) throw notFound();
			return { id: params.id };
		},
		{ successStatus: 200, failureMessage: 'Failed to delete recipe' }
	);
};
