import type { Recipe } from '#lib/types.js';

/** A recipe as /api/v1 returns it: the stored `*Json` lists under plain names. */
export function toApiRecipe(recipe: Recipe) {
	const { ingredientsJson, instructionsJson, ...rest } = recipe;
	return { ...rest, ingredients: ingredientsJson, instructions: instructionsJson };
}
