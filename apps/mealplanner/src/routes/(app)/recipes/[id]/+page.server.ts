import { error, isRedirect, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { addWeeks } from '#lib/dates.js';
import {
	addMealPlanEntrySchema,
	ingredientsJsonSchema,
	instructionsJsonSchema
} from '#lib/schemas/mealPlan.js';
import {
	deleteCookSchema,
	logCookSchema,
	rateRecipeSchema,
	recipeFormSchema,
	recipeToForm
} from '#lib/schemas/recipes.js';
import { requireAuth } from '#lib/server/actions/auth-guard.js';
import { handleDomainAction } from '#lib/server/actions/domain-action.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { logger } from '#lib/server/logger.js';
import { addMealPlanEntry, getMondayOfCurrentWeek } from '#lib/server/services/mealPlan.js';
import { deleteCook, listCooks, logCook } from '#lib/server/services/recipeCooks.js';
import {
	deleteRecipe,
	getRecipe,
	setRecipeRating,
	updateRecipe
} from '#lib/server/services/recipes.js';
import type { Recipe, RecipeCook } from '#lib/types.js';

import type { Actions, PageServerLoad } from './$types';

/** How many weeks, from this one, the "Add to planner" picker offers. */
const PLANNER_WEEKS = 4;

export const load: PageServerLoad = async ({ params }) => {
	const thisWeek = getMondayOfCurrentWeek();
	const plannerWeeks = Array.from({ length: PLANNER_WEEKS }, (_, i) => addWeeks(thisWeek, i));
	const cookForm = await superValidate(zod4(logCookSchema));

	let recipe: Recipe | null;
	let cooks: RecipeCook[];
	try {
		[recipe, cooks] = await Promise.all([getRecipe(params.id), listCooks(params.id)]);
	} catch (err) {
		logger.error('Failed to load recipe:', err, { recipeId: params.id });
		return {
			recipe: null,
			cooks: [],
			plannerWeeks,
			form: await superValidate(zod4(recipeFormSchema)),
			cookForm,
			loadError: 'Failed to load this recipe. Please try refreshing the page.'
		};
	}
	if (!recipe) error(404, 'Recipe not found');

	return {
		recipe,
		cooks,
		plannerWeeks,
		form: await superValidate(recipeToForm(recipe), zod4(recipeFormSchema)),
		cookForm
	};
};

export const actions: Actions = {
	update: requireAuth(async ({ request, params }, user) => {
		const form = await superValidate(request, zod4(recipeFormSchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(
			form,
			() =>
				updateRecipe(params.id, {
					name: form.data.name,
					description: form.data.description,
					ingredientsJson: ingredientsJsonSchema.parse(form.data.ingredientsJson),
					instructionsJson: instructionsJsonSchema.parse(form.data.instructionsJson),
					prepTimeMinutes: form.data.prepTimeMinutes,
					servings: form.data.servings
				}),
			{
				loggerContext: 'Failed to update recipe',
				fallbackMessage: 'Could not save that recipe. Please try again.',
				successMessage: 'Recipe saved.',
				logFields: { userId: user.id, recipeId: params.id }
			}
		);
	}),

	delete: requireAuth(async ({ params }, user) => {
		const form = await superValidate(zod4(recipeFormSchema));
		let deleted: boolean;
		try {
			deleted = await deleteRecipe(params.id);
		} catch (err) {
			if (isRedirect(err)) throw err;
			logger.error('Failed to delete recipe', err, { userId: user.id, recipeId: params.id });
			return message(
				form,
				{ type: 'error', text: 'Could not delete that recipe. Please try again.' },
				{ status: 500 }
			);
		}
		if (!deleted) {
			return message(
				form,
				{ type: 'error', text: 'That recipe is already gone.' },
				{ status: 404 }
			);
		}
		throw redirect(303, '/recipes');
	}),

	rate: requireAuth(async ({ request, params }, user) => {
		const form = await superValidate(request, zod4(rateRecipeSchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(
			form,
			async () => {
				const found = await setRecipeRating(params.id, form.data.rating || null);
				if (!found) throw new Error(`Recipe not found: ${params.id}`);
			},
			{
				loggerContext: 'Failed to rate recipe',
				fallbackMessage: 'Could not save that rating. Please try again.',
				successMessage: form.data.rating ? `Rated ${form.data.rating} of 5.` : 'Rating cleared.',
				logFields: { userId: user.id, recipeId: params.id }
			}
		);
	}),

	logCook: requireAuth(async ({ request, params }, user) => {
		const form = await superValidate(request, zod4(logCookSchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(form, () => logCook(user.id, params.id, form.data), {
			loggerContext: 'Failed to log cook',
			fallbackMessage: 'Could not log that. Please try again.',
			successMessage: 'Logged. Nice cooking.',
			logFields: { userId: user.id, recipeId: params.id }
		});
	}),

	deleteCook: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(deleteCookSchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(form, () => deleteCook(form.data.cookId), {
			loggerContext: 'Failed to delete cook',
			fallbackMessage: 'Could not remove that entry. Please try again.',
			successMessage: 'Entry removed.',
			logFields: { userId: user.id }
		});
	}),

	addToPlanner: requireAuth(async ({ request, params }, user) => {
		const form = await superValidate(request, zod4(addMealPlanEntrySchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(
			form,
			() => addMealPlanEntry(user.id, form.data.weekStartDate, form.data.dayOfWeek, params.id),
			{
				loggerContext: 'Failed to add recipe to planner',
				fallbackMessage: 'Could not add that to the planner. Please try again.',
				successMessage: 'Added to the planner.',
				logFields: { userId: user.id, recipeId: params.id }
			}
		);
	})
};
