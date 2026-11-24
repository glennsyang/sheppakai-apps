import { isRedirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import {
	ingredientsJsonSchema,
	instructionsJsonSchema,
	saveRecipeSchema
} from '#lib/schemas/mealPlan.js';
import { requireAuth } from '#lib/server/actions/auth-guard.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { logger } from '#lib/server/logger.js';
import { saveSuggestion, searchRecipes } from '#lib/server/services/recipes.js';

import type { Actions, PageServerLoad } from './$types';

const MAX_QUERY_LENGTH = 100;
const LIBRARY_LIMIT = 500;

export const load: PageServerLoad = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH).trim();
	try {
		return { recipes: await searchRecipes({ q, limit: LIBRARY_LIMIT }), q };
	} catch (error) {
		logger.error('Failed to load recipes:', error);
		return {
			recipes: [],
			q,
			loadError: 'Failed to load your recipes. Please try refreshing the page.'
		};
	}
};

export const actions: Actions = {
	/**
	 * "Save to Library" on a Suggestion card (Suggest page and the planner's Variations panel).
	 * Answers with the Recipe id and whether an existing Library Recipe was reused, so the card
	 * can link to it without leaving the page.
	 */
	saveSuggestion: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(saveRecipeSchema));
		if (!form.valid) return invalidForm(form);

		try {
			const { recipe, reused } = await saveSuggestion(user.id, {
				name: form.data.name,
				description: form.data.description,
				ingredients: ingredientsJsonSchema.parse(form.data.ingredientsJson),
				steps: instructionsJsonSchema.parse(form.data.instructionsJson),
				prepTimeMinutes: form.data.prepTimeMinutes,
				servings: form.data.servings
			});
			form.message = {
				type: 'success',
				text: reused ? 'Already in your Library' : 'Saved to your Library'
			};
			return { form, recipeId: recipe.id, reused };
		} catch (err) {
			if (isRedirect(err)) throw err;
			logger.error('Failed to save Suggestion to the Library', err, { userId: user.id });
			return message(
				form,
				{ type: 'error', text: 'Could not save that dinner to your Library. Please try again.' },
				{ status: 500 }
			);
		}
	})
};
