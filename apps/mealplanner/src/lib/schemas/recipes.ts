import { z } from 'zod';

import { parseIsoDate } from '#lib/dates.js';
import type { Recipe } from '#lib/types.js';

import { ingredientsJsonSchema, instructionsJsonSchema } from './mealPlan';

const MAX_LIST_ITEMS = 50;

const recipeUrlSchema = z
	.string()
	.trim()
	.max(2000, 'URL is too long')
	.pipe(z.url({ protocol: /^https?$/, message: 'Enter a web address starting with http(s)://' }));

/**
 * The recipe library's add/edit form. Ingredients and steps travel as JSON strings, like the
 * planner's recipe forms, because superforms rejects array-of-object fields.
 */
export const recipeFormSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(200),
	description: z.string().trim().max(2000).default(''),
	ingredientsJson: z
		.string()
		.default('[]')
		.refine((raw) => ingredientsJsonSchema.safeParse(raw).success, 'Invalid ingredients'),
	instructionsJson: z
		.string()
		.default('[]')
		.refine((raw) => instructionsJsonSchema.safeParse(raw).success, 'Invalid instructions'),
	prepTimeMinutes: z.coerce.number().int().min(0).max(1440).default(0),
	servings: z.coerce.number().int().min(1).max(100).default(1),
	// Set by an import and carried through review to the save.
	source: z.enum(['custom', 'imported']).default('custom'),
	sourceUrl: z.union([z.literal(''), recipeUrlSchema]).default('')
});

export const importUrlSchema = z.object({ url: recipeUrlSchema });

/** 0 clears the rating. */
export const rateRecipeSchema = z.object({
	rating: z.coerce.number().int().min(0).max(5)
});

export const logCookSchema = z.object({
	cookedOn: z.string().refine((value) => parseIsoDate(value) !== null, 'Pick a valid date'),
	notes: z.string().trim().max(500).default('')
});

export const deleteCookSchema = z.object({
	cookId: z.string().min(1, 'Cook ID is required')
});

// ─── Import results ───────────────────────────────────────────────────────────
//
// What a page's JSON-LD or the model hands back. It's untrusted and often a little
// off (overlong text, fractional servings, too many steps), so it's clipped and
// defaulted rather than rejected; only a missing name means "not a recipe".

const clipped = (max: number) =>
	z
		.string()
		.transform((value) => value.replace(/\s+/g, ' ').trim().slice(0, max))
		.catch('');

const wholeOr = (fallback: number, min: number, max: number) =>
	z
		.number()
		.nullish()
		.transform((n) =>
			typeof n === 'number' && Number.isFinite(n) && n >= min
				? Math.min(max, Math.round(n))
				: fallback
		)
		.catch(fallback);

const importedIngredientSchema = z.object({
	quantity: clipped(50).default(''),
	unit: clipped(50).default(''),
	name: clipped(200)
});

export const recipeImportResultSchema = z.object({
	name: z
		.string()
		.transform((value) => value.replace(/\s+/g, ' ').trim().slice(0, 200))
		.pipe(z.string().min(1)),
	description: clipped(2000)
		.nullish()
		.transform((value) => value ?? ''),
	ingredients: z
		.array(z.unknown())
		.nullish()
		.transform((items) =>
			(items ?? [])
				.flatMap((item) => {
					const parsed = importedIngredientSchema.safeParse(item);
					return parsed.success && parsed.data.name ? [parsed.data] : [];
				})
				.slice(0, MAX_LIST_ITEMS)
		),
	steps: z
		.array(z.unknown())
		.nullish()
		.transform((items) =>
			(items ?? [])
				.flatMap((item) => (typeof item === 'string' ? [clipped(2000).parse(item)] : []))
				.filter(Boolean)
				.slice(0, MAX_LIST_ITEMS)
		),
	prepTimeMinutes: wholeOr(0, 0, 1440),
	servings: wholeOr(1, 1, 100)
});

export type RecipeImportResult = z.output<typeof recipeImportResultSchema>;

/** An import result as recipe-form data, ready for review before saving. */
export function importResultToForm(
	result: RecipeImportResult,
	sourceUrl = ''
): z.input<typeof recipeFormSchema> {
	return {
		name: result.name,
		description: result.description,
		ingredientsJson: JSON.stringify(result.ingredients),
		instructionsJson: JSON.stringify(result.steps),
		prepTimeMinutes: result.prepTimeMinutes,
		servings: result.servings,
		source: 'imported',
		sourceUrl
	};
}

/** A saved recipe as recipe-form data, for the edit form. */
export function recipeToForm(recipe: Recipe): z.input<typeof recipeFormSchema> {
	return {
		name: recipe.name,
		description: recipe.description,
		ingredientsJson: JSON.stringify(recipe.ingredientsJson),
		instructionsJson: JSON.stringify(recipe.instructionsJson),
		prepTimeMinutes: recipe.prepTimeMinutes,
		servings: recipe.servings,
		source: recipe.source === 'imported' ? 'imported' : 'custom',
		sourceUrl: recipe.sourceUrl ?? ''
	};
}
