import { describe, expect, it } from 'vitest';

import {
	findJsonLdRecipe,
	isoDurationMinutes,
	parseIngredientLine
} from '../../../lib/server/recipe-import/json-ld';

function page(...blocks: unknown[]): string {
	const scripts = blocks
		.map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`)
		.join('\n');
	return `<html><head><title>x</title>${scripts}</head><body>Hi</body></html>`;
}

const recipe = {
	'@context': 'https://schema.org',
	'@type': 'Recipe',
	name: 'Chana Masala &amp; Rice',
	description: '<p>A weeknight curry.</p>',
	recipeIngredient: ['2 cups cooked chickpeas', '1 ½ tbsp. garam masala', 'Salt to taste'],
	recipeInstructions: [
		{ '@type': 'HowToStep', text: 'Fry the onion.' },
		{ '@type': 'HowToStep', text: 'Add the spices.' }
	],
	totalTime: 'PT45M',
	recipeYield: ['4', '4 servings']
};

describe('findJsonLdRecipe', () => {
	it('maps a top-level Recipe', () => {
		expect(findJsonLdRecipe(page(recipe))).toEqual({
			name: 'Chana Masala & Rice',
			description: 'A weeknight curry.',
			ingredients: [
				{ quantity: '2', unit: 'cups', name: 'cooked chickpeas' },
				{ quantity: '1 ½', unit: 'tbsp', name: 'garam masala' },
				{ quantity: '', unit: '', name: 'Salt to taste' }
			],
			steps: ['Fry the onion.', 'Add the spices.'],
			prepTimeMinutes: 45,
			servings: 4
		});
	});

	it('finds a Recipe inside @graph with an @type array', () => {
		const graph = {
			'@context': 'https://schema.org',
			'@graph': [
				{ '@type': 'WebPage', name: 'Page' },
				{ ...recipe, '@type': ['Recipe', 'NewsArticle'] }
			]
		};
		expect(findJsonLdRecipe(page(graph))?.name).toBe('Chana Masala & Rice');
	});

	it('skips non-recipe and broken blocks before the recipe', () => {
		const html =
			'<script type="application/ld+json">{not json</script>' +
			page({ '@type': 'Organization', name: 'Site' }, [recipe]);
		expect(findJsonLdRecipe(html)?.steps).toHaveLength(2);
	});

	it('flattens HowToSection steps and string instructions', () => {
		const sections = {
			...recipe,
			recipeInstructions: [
				{
					'@type': 'HowToSection',
					name: 'Sauce',
					itemListElement: [{ '@type': 'HowToStep', text: 'Simmer.' }]
				},
				'Serve.'
			]
		};
		expect(findJsonLdRecipe(page(sections))?.steps).toEqual(['Simmer.', 'Serve.']);

		const oneString = { ...recipe, recipeInstructions: 'Mix.\nBake.\n\nCool.' };
		expect(findJsonLdRecipe(page(oneString))?.steps).toEqual(['Mix.', 'Bake.', 'Cool.']);
	});

	it('adds prepTime and cookTime when totalTime is missing, and reads yield text', () => {
		const split = {
			...recipe,
			totalTime: undefined,
			prepTime: 'PT15M',
			cookTime: 'PT1H',
			recipeYield: 'Serves 6-8'
		};
		expect(findJsonLdRecipe(page(split))).toMatchObject({ prepTimeMinutes: 75, servings: 6 });
	});

	it('defaults missing time and yield', () => {
		const bare = { '@type': 'Recipe', name: 'Toast' };
		expect(findJsonLdRecipe(page(bare))).toEqual({
			name: 'Toast',
			description: '',
			ingredients: [],
			steps: [],
			prepTimeMinutes: 0,
			servings: 1
		});
	});

	it('returns null without a named Recipe', () => {
		expect(findJsonLdRecipe('<html><body>No data</body></html>')).toBeNull();
		expect(findJsonLdRecipe(page({ '@type': 'Article', name: 'News' }))).toBeNull();
		expect(findJsonLdRecipe(page({ ...recipe, name: '  ' }))).toBeNull();
	});

	it('caps lists at the stored bounds', () => {
		const long = { ...recipe, recipeIngredient: Array.from({ length: 80 }, (_, i) => `${i} eggs`) };
		expect(findJsonLdRecipe(page(long))?.ingredients).toHaveLength(50);
	});
});

describe('parseIngredientLine', () => {
	it.each([
		['400g beef mince', { quantity: '400', unit: 'g', name: 'beef mince' }],
		['2 1/2 cups of flour', { quantity: '2 1/2', unit: 'cups', name: 'flour' }],
		['2 large eggs', { quantity: '2', unit: '', name: 'large eggs' }],
		['1-2 cloves garlic', { quantity: '1-2', unit: 'cloves', name: 'garlic' }],
		['½ lemon', { quantity: '½', unit: '', name: 'lemon' }],
		['Fresh basil', { quantity: '', unit: '', name: 'Fresh basil' }],
		['3', { quantity: '', unit: '', name: '3' }]
	])('%s', (line, expected) => {
		expect(parseIngredientLine(line)).toEqual(expected);
	});
});

describe('isoDurationMinutes', () => {
	it.each([
		['PT1H30M', 90],
		['P0DT0H45M', 45],
		['PT90S', 2],
		['P1D', 1440],
		['PT0M', null],
		['45 minutes', null],
		[45, null]
	])('%s → %s', (value, minutes) => {
		expect(isoDurationMinutes(value)).toBe(minutes);
	});
});
