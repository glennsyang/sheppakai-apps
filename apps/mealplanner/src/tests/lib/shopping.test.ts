import { describe, expect, it } from 'vitest';

import {
	aisleFor,
	buildNeeds,
	convertQuantity,
	formatAmount,
	normalizeIngredientName,
	parseQuantity
} from '../../lib/shopping';

const ing = (name: string, quantity = '', unit = '') => ({ name, quantity, unit });

describe('normalizeIngredientName', () => {
	it.each([
		['Onions', 'onion'],
		['  Garlic,  minced ', 'garlic'],
		['Tomatoes (diced)', 'tomato'],
		['Cherry  Tomatoes', 'cherry tomato'],
		['Berries', 'berry'],
		['Swiss', 'swiss'],
		['Peas', 'pea'],
		['', '']
	])('%j → %j', (input, expected) => {
		expect(normalizeIngredientName(input)).toBe(expected);
	});
});

describe('parseQuantity', () => {
	it.each([
		['2', 2],
		['1.5', 1.5],
		['1/2', 0.5],
		['1 1/2', 1.5],
		['1½', 1.5],
		['2-3', 3],
		['2 to 3', 3],
		['', null],
		['a pinch', null],
		['0', null],
		['1/0', null]
	])('%j → %j', (input, expected) => {
		expect(parseQuantity(input)).toBe(expected);
	});
});

describe('convertQuantity', () => {
	it('converts within a dimension, through aliases', () => {
		expect(convertQuantity(1, 'kg', 'grams')).toBe(1000);
		expect(convertQuantity(3, 'tsp', 'tablespoons')).toBeCloseTo(1);
		expect(convertQuantity(2, 'Cups', 'cup')).toBe(2);
	});

	it('treats other units as counts of that word', () => {
		expect(convertQuantity(2, 'cloves', 'clove')).toBe(2);
		expect(convertQuantity(2, '', null)).toBe(2);
	});

	it('refuses to cross dimensions', () => {
		expect(convertQuantity(1, 'cup', 'g')).toBeNull();
		expect(convertQuantity(1, 'clove', 'head')).toBeNull();
	});
});

describe('aisleFor', () => {
	it.each([
		['Red onion', 'Produce'],
		['Eggplant', 'Produce'],
		['Minced garlic', 'Produce'],
		['Chicken thighs', 'Meat & seafood'],
		['Eggs', 'Dairy & eggs'],
		['Coconut milk', 'Pantry'],
		['Chicken stock', 'Pantry'],
		['Frozen peas', 'Frozen'],
		['Tortillas', 'Bakery'],
		['Paper towels', 'Other']
	])('%j → %s', (name, aisle) => {
		expect(aisleFor(name)).toBe(aisle);
	});
});

describe('buildNeeds', () => {
	it('sums the same ingredient across recipes, converting units', () => {
		const needs = buildNeeds(
			[[ing('Butter', '2', 'tbsp')], [ing('butter', '1', 'tsp'), ing('Onions', '2')]],
			[]
		);
		expect(needs).toEqual([
			{ key: 'butter|volume', name: 'Butter', quantity: 2.33, unit: 'tbsp', aisle: 'Dairy & eggs' },
			{ key: 'onion|count:', name: 'Onions', quantity: 2, unit: null, aisle: 'Produce' }
		]);
	});

	it('keeps incompatible units of one ingredient apart', () => {
		const needs = buildNeeds([[ing('Garlic', '2', 'cloves'), ing('Garlic', '1', 'tbsp')]], []);
		expect(needs.map((n) => n.key)).toEqual(['garlic|count:clove', 'garlic|volume']);
	});

	it('falls back to an unknown amount when any quantity is not a number', () => {
		const [need] = buildNeeds(
			[[ing('Parsley', '1', 'cup')], [ing('Parsley', 'a handful', 'cup')]],
			[]
		);
		expect(need.quantity).toBeNull();
	});

	it('skips staples and blank names', () => {
		expect(
			buildNeeds([[ing('Salt'), ing('Black pepper'), ing('Water', '1', 'cup'), ing(' ')]], [])
		).toEqual([]);
	});

	it('subtracts pantry stock with compatible units', () => {
		const needs = buildNeeds(
			[[ing('Rice', '3', 'cups'), ing('Chicken', '1000', 'g')]],
			[
				{ name: 'rice', quantity: 1, unit: 'cup' },
				{ name: 'Chicken', quantity: 1, unit: 'kg' }
			]
		);
		expect(needs).toEqual([
			expect.objectContaining({ key: 'rice|volume', quantity: 2, unit: 'cup' })
		]);
	});

	it('treats a pantry item with no amount or an incomparable unit as enough', () => {
		const needs = buildNeeds(
			[[ing('Carrots', '3'), ing('Lemon', '2'), ing('Cumin', 'some')]],
			[
				{ name: 'Carrot', quantity: null, unit: null },
				{ name: 'Lemon', quantity: 1, unit: 'bag' },
				{ name: 'cumin', quantity: 1, unit: 'jar' }
			]
		);
		expect(needs).toEqual([]);
	});
});

describe('formatAmount', () => {
	it('formats known amounts and leaves unknown ones blank', () => {
		expect(formatAmount(1.5, 'cup')).toBe('1.5 cup');
		expect(formatAmount(3, null)).toBe('3');
		expect(formatAmount(null, 'cup')).toBe('');
	});
});
