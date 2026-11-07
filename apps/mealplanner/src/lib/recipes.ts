import { parseIsoDate } from '#lib/dates.js';
import type { MealSuggestion, Recipe } from '#lib/types.js';

/** A saved recipe in the shape the recipe drawer reads. */
export function recipeAsSuggestion(recipe: Recipe): MealSuggestion {
	return {
		name: recipe.name,
		description: recipe.description,
		ingredients: recipe.ingredientsJson,
		steps: recipe.instructionsJson,
		prepTimeMinutes: recipe.prepTimeMinutes,
		servings: recipe.servings
	};
}

/** A `YYYY-MM-DD` cook date for display, e.g. "Oct 30, 2026". */
export function formatCookedOn(isoDate: string): string {
	const date = parseIsoDate(isoDate);
	return date
		? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
		: isoDate;
}
