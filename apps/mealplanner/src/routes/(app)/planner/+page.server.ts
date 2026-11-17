import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import {
	removeMealPlanEntrySchema,
	saveAndAddSchema,
	addCustomMealSchema,
	ingredientsJsonSchema,
	instructionsJsonSchema
} from '#lib/schemas/mealPlan.js';
import { requireAuth } from '#lib/server/actions/auth-guard.js';
import { handleDomainAction } from '#lib/server/actions/domain-action.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { logger } from '#lib/server/logger.js';
import {
	getMealPlanWithEntries,
	addMealPlanEntry,
	removeMealPlanEntry
} from '#lib/server/services/mealPlan.js';
import { saveRecipe } from '#lib/server/services/recipes.js';
import { resolveWeekStartDate } from '#lib/server/week.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const weekStartDate = resolveWeekStartDate(url);

	const addCustomForm = await superValidate(zod4(addCustomMealSchema));

	try {
		const entries = await getMealPlanWithEntries(weekStartDate);
		return { entries, weekStartDate, addCustomForm };
	} catch (error) {
		logger.error('Failed to load meal plan:', error);
		return {
			entries: [],
			weekStartDate,
			loadError: 'Failed to load your meal plan. Please try refreshing the page.',
			addCustomForm
		};
	}
};

export const actions: Actions = {
	saveAndAdd: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(saveAndAddSchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(
			form,
			async () => {
				const recipe = await saveRecipe(user.id, {
					name: form.data.name,
					description: form.data.description,
					ingredientsJson: ingredientsJsonSchema.parse(form.data.ingredientsJson),
					instructionsJson: instructionsJsonSchema.parse(form.data.instructionsJson),
					prepTimeMinutes: form.data.prepTimeMinutes,
					servings: form.data.servings
				});
				await addMealPlanEntry(user.id, form.data.weekStartDate, form.data.dayOfWeek, recipe.id);
			},
			{
				loggerContext: 'Failed to save recipe and add to planner',
				fallbackMessage: 'Could not add that meal to the planner. Please try again.',
				successMessage: `Added ${form.data.name} to the planner.`,
				logFields: { userId: user.id }
			}
		);
	}),

	remove: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(removeMealPlanEntrySchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(form, () => removeMealPlanEntry(form.data.entryId), {
			loggerContext: 'Failed to remove meal plan entry',
			fallbackMessage: 'Could not remove that meal. Please try again.',
			successMessage: 'Meal removed.',
			logFields: { userId: user.id }
		});
	}),

	addCustom: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(addCustomMealSchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(
			form,
			async () => {
				const recipe = await saveRecipe(user.id, {
					name: form.data.name,
					description: form.data.notes ?? '',
					ingredientsJson: [],
					instructionsJson: [],
					prepTimeMinutes: 0,
					servings: 1,
					source: 'custom'
				});
				await addMealPlanEntry(user.id, form.data.weekStartDate, form.data.dayOfWeek, recipe.id);
			},
			{
				loggerContext: 'Failed to add custom meal',
				fallbackMessage: 'Could not add your meal. Please try again.',
				successMessage: `Added ${form.data.name} to the planner.`,
				logFields: { userId: user.id }
			}
		);
	})
};
