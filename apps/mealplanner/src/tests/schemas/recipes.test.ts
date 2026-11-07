import { describe, expect, it } from 'vitest';

import {
	importResultToForm,
	importUrlSchema,
	logCookSchema,
	rateRecipeSchema,
	recipeFormSchema,
	recipeImportResultSchema
} from '../../lib/schemas/recipes';

describe('recipeImportResultSchema', () => {
	it('defaults and clips loose model output instead of rejecting it', () => {
		const result = recipeImportResultSchema.parse({
			name: '  Banana   Bread ',
			description: null,
			ingredients: [
				{ quantity: '3', unit: '', name: 'bananas' },
				{ quantity: '1', unit: 'cup' }, // no name: dropped
				'stray string',
				{ quantity: 2, unit: 'tsp', name: 'baking soda' } // non-string quantity: blanked
			],
			steps: ['Mash.', '', 7, 'Bake.'],
			prepTimeMinutes: 62.6,
			servings: null
		});

		expect(result).toEqual({
			name: 'Banana Bread',
			description: '',
			ingredients: [
				{ quantity: '3', unit: '', name: 'bananas' },
				{ quantity: '', unit: 'tsp', name: 'baking soda' }
			],
			steps: ['Mash.', 'Bake.'],
			prepTimeMinutes: 63,
			servings: 1
		});
	});

	it('caps lists and long text at the stored bounds', () => {
		const result = recipeImportResultSchema.parse({
			name: 'x'.repeat(500),
			steps: Array.from({ length: 80 }, () => 'y'.repeat(3000)),
			servings: 5000
		});
		expect(result.name).toHaveLength(200);
		expect(result.steps).toHaveLength(50);
		expect(result.steps[0]).toHaveLength(2000);
		expect(result.servings).toBe(100);
	});

	it('rejects output without a name', () => {
		expect(recipeImportResultSchema.safeParse({ name: '   ' }).success).toBe(false);
		expect(recipeImportResultSchema.safeParse({ ingredients: [] }).success).toBe(false);
	});

	it('round-trips into a valid recipe form', () => {
		const result = recipeImportResultSchema.parse({
			name: 'Soup',
			ingredients: [{ quantity: '1', unit: 'l', name: 'stock' }],
			steps: ['Heat.']
		});
		const form = recipeFormSchema.parse(importResultToForm(result, 'https://example.com/soup'));
		expect(form).toMatchObject({
			name: 'Soup',
			source: 'imported',
			sourceUrl: 'https://example.com/soup',
			ingredientsJson: '[{"quantity":"1","unit":"l","name":"stock"}]',
			instructionsJson: '["Heat."]'
		});
	});
});

describe('recipeFormSchema', () => {
	it('accepts a written-in recipe with only a name', () => {
		expect(recipeFormSchema.parse({ name: 'Tacos' })).toMatchObject({
			ingredientsJson: '[]',
			instructionsJson: '[]',
			prepTimeMinutes: 0,
			servings: 1,
			source: 'custom',
			sourceUrl: ''
		});
	});

	it('rejects malformed ingredient JSON and a non-http source URL', () => {
		expect(recipeFormSchema.safeParse({ name: 'X', ingredientsJson: '{' }).success).toBe(false);
		expect(
			recipeFormSchema.safeParse({ name: 'X', sourceUrl: 'javascript:alert(1)' }).success
		).toBe(false);
	});
});

describe('importUrlSchema', () => {
	it('accepts http(s) and rejects other schemes', () => {
		expect(importUrlSchema.safeParse({ url: ' https://example.com/r ' }).success).toBe(true);
		expect(importUrlSchema.safeParse({ url: 'ftp://example.com/r' }).success).toBe(false);
		expect(importUrlSchema.safeParse({ url: 'example.com' }).success).toBe(false);
	});
});

describe('rateRecipeSchema / logCookSchema', () => {
	it('bounds the rating to 0–5', () => {
		expect(rateRecipeSchema.safeParse({ rating: '0' }).success).toBe(true);
		expect(rateRecipeSchema.safeParse({ rating: '6' }).success).toBe(false);
	});

	it('needs a real calendar date', () => {
		expect(logCookSchema.safeParse({ cookedOn: '2026-02-28' }).success).toBe(true);
		expect(logCookSchema.safeParse({ cookedOn: '2026-02-30' }).success).toBe(false);
	});
});
