import { describe, expect, it } from 'vitest';

import {
	suggestionSchema,
	pickValidSuggestions,
	saveRecipeSchema
} from '../../lib/schemas/mealPlan';

const valid = {
	name: 'Chicken Curry',
	description: 'Warm and spicy.',
	ingredients: [{ name: 'chicken', quantity: '500', unit: 'g' }],
	steps: ['Brown the chicken', 'Simmer'],
	prepTimeMinutes: 40,
	servings: 4
};

describe('suggestionSchema', () => {
	it('accepts a well-formed suggestion and rounds fractional numbers', () => {
		expect(suggestionSchema.parse({ ...valid, prepTimeMinutes: 37.5 }).prepTimeMinutes).toBe(38);
	});

	it.each([
		['missing steps', { ...valid, steps: undefined }],
		['ingredient missing unit', { ...valid, ingredients: [{ name: 'x', quantity: '1' }] }],
		['string prep time', { ...valid, prepTimeMinutes: '40' }],
		['zero servings', { ...valid, servings: 0 }],
		['overlong name', { ...valid, name: 'x'.repeat(201) }],
		['too many steps', { ...valid, steps: Array(51).fill('step') }]
	])('rejects %s', (_label, input) => {
		expect(suggestionSchema.safeParse(input).success).toBe(false);
	});

	it('anything it accepts also passes saveRecipe validation', () => {
		const s = suggestionSchema.parse(valid);
		const result = saveRecipeSchema.safeParse({
			name: s.name,
			description: s.description,
			ingredientsJson: JSON.stringify(s.ingredients),
			instructionsJson: JSON.stringify(s.steps),
			prepTimeMinutes: s.prepTimeMinutes,
			servings: s.servings
		});
		expect(result.success).toBe(true);
	});

	it('pickValidSuggestions keeps valid items and counts the rest', () => {
		expect(pickValidSuggestions([valid, { name: 'bad' }, null])).toEqual({
			suggestions: [valid],
			rejected: 2
		});
		expect(pickValidSuggestions('nope')).toEqual({ suggestions: [], rejected: 0 });
	});
});
