import { z } from 'zod';

import { ingredientListSchema, instructionListSchema } from '#lib/schemas/mealPlan.js';

// Bounds match the recipe form (recipeFormSchema in #lib/schemas/recipes.ts), but take real arrays
// instead of the form's JSON strings. Defaults match a written-in custom meal.
export const apiCreateRecipeSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(200),
	description: z.string().max(2000).default(''),
	ingredients: ingredientListSchema.default([]),
	instructions: instructionListSchema.default([]),
	prepTimeMinutes: z.number().int().min(0).max(1440).default(0),
	servings: z.number().int().min(1).max(100).default(1)
});

export const apiUpdateRecipeSchema = z
	.object({
		name: z.string().trim().min(1, 'Name is required').max(200),
		description: z.string().max(2000),
		ingredients: ingredientListSchema,
		instructions: instructionListSchema,
		prepTimeMinutes: z.number().int().min(0).max(1440),
		servings: z.number().int().min(1).max(100)
	})
	.partial()
	.refine((patch) => Object.keys(patch).length > 0, 'Provide at least one field to update');

export const apiRecipeListQuerySchema = z.object({
	// 'ai' is the pre-#315 name for 'suggested'; still accepted so existing clients keep working.
	source: z
		.enum(['suggested', 'custom', 'imported', 'ai'])
		.transform((source) => (source === 'ai' ? 'suggested' : source))
		.optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50)
});
