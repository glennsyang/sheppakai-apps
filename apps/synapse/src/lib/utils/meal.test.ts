import { describe, expect, it } from 'vitest';

import {
	getFrequentMeals,
	mealTypeForNow,
	parseMealDay,
	sortMealsForDay,
	sumCalories
} from './meal';

const meal = (
	date: string,
	description: string,
	timeOfDay = 'breakfast',
	caloriesEstimate: number | null = null
) => ({ date, description, timeOfDay, caloriesEstimate });

describe('getFrequentMeals', () => {
	it('returns an empty list when nothing is logged', () => {
		expect(getFrequentMeals([])).toEqual([]);
	});

	it('ranks meals by how often they are logged', () => {
		const result = getFrequentMeals([
			meal('2026-10-20', 'Toast'),
			meal('2026-10-21', 'Oatmeal'),
			meal('2026-10-22', 'Oatmeal'),
			meal('2026-10-23', 'Oatmeal'),
			meal('2026-10-23', 'Toast')
		]);

		expect(result.map((m) => [m.description, m.count])).toEqual([
			['Oatmeal', 3],
			['Toast', 2]
		]);
	});

	it('breaks count ties by the most recent log', () => {
		const result = getFrequentMeals([
			meal('2026-10-20', 'Toast'),
			meal('2026-10-22', 'Oatmeal'),
			meal('2026-10-21', 'Eggs')
		]);

		expect(result.map((m) => m.description)).toEqual(['Oatmeal', 'Eggs', 'Toast']);
	});

	it('groups descriptions that differ only in case and spacing', () => {
		const result = getFrequentMeals([
			meal('2026-10-21', 'oatmeal  with berries '),
			meal('2026-10-22', 'Oatmeal with berries')
		]);

		expect(result).toHaveLength(1);
		expect(result[0].count).toBe(2);
	});

	it('keeps the wording and calories of the latest log, whatever the input order', () => {
		const result = getFrequentMeals([
			meal('2026-10-20', 'oatmeal', 'breakfast', 300),
			meal('2026-10-22', 'Oatmeal', 'breakfast', 350),
			meal('2026-10-21', 'OATMEAL', 'breakfast', 320)
		]);

		expect(result[0]).toMatchObject({
			description: 'Oatmeal',
			caloriesEstimate: 350,
			lastDate: '2026-10-22'
		});
	});

	it('uses the meal type the meal is most often logged as', () => {
		const result = getFrequentMeals([
			meal('2026-10-20', 'Yogurt', 'snack'),
			meal('2026-10-21', 'Yogurt', 'breakfast'),
			meal('2026-10-22', 'Yogurt', 'breakfast')
		]);

		expect(result[0].timeOfDay).toBe('breakfast');
	});

	it('skips blank descriptions and unknown meal types', () => {
		const result = getFrequentMeals([
			meal('2026-10-20', '   '),
			meal('2026-10-21', 'Brunch', 'brunch'),
			meal('2026-10-22', 'Toast')
		]);

		expect(result.map((m) => m.description)).toEqual(['Toast']);
	});

	it('caps the list at the limit', () => {
		const meals = ['A', 'B', 'C', 'D', 'E', 'F'].map((d, i) => meal(`2026-10-2${i}`, d));

		expect(getFrequentMeals(meals)).toHaveLength(5);
		expect(getFrequentMeals(meals, 2)).toHaveLength(2);
	});
});

describe('mealTypeForNow', () => {
	// Pacific is UTC-7 in October.
	it.each([
		['2026-10-24T14:00:00Z', 'breakfast'], // 07:00
		['2026-10-24T18:00:00Z', 'lunch'], // 11:00
		['2026-10-25T00:30:00Z', 'dinner'], // 17:30
		['2026-10-25T05:00:00Z', 'snack'] // 22:00
	])('maps %s to %s in Pacific time', (iso, expected) => {
		expect(mealTypeForNow(new Date(iso))).toBe(expected);
	});
});

describe('sortMealsForDay', () => {
	it('orders breakfast, lunch, dinner, snack and keeps order within a type', () => {
		const result = sortMealsForDay([
			meal('2026-11-18', 'Chips', 'snack'),
			meal('2026-11-18', 'Salmon', 'dinner'),
			meal('2026-11-18', 'Apple', 'snack'),
			meal('2026-11-18', 'Oatmeal', 'breakfast'),
			meal('2026-11-18', 'Wrap', 'lunch')
		]);
		expect(result.map((m) => m.description)).toEqual([
			'Oatmeal',
			'Wrap',
			'Salmon',
			'Chips',
			'Apple'
		]);
	});
});

describe('sumCalories', () => {
	it('adds estimates and counts missing ones as 0', () => {
		expect(
			sumCalories([
				meal('2026-11-18', 'Oatmeal', 'breakfast', 350),
				meal('2026-11-18', 'Coffee', 'breakfast', null),
				meal('2026-11-18', 'Wrap', 'lunch', 600)
			])
		).toBe(950);
	});

	it('is 0 for no meals', () => {
		expect(sumCalories([])).toBe(0);
	});
});

describe('parseMealDay', () => {
	const today = '2026-11-18';

	it('falls back to today when the param is missing or malformed', () => {
		expect(parseMealDay(null, today)).toBe(today);
		expect(parseMealDay('', today)).toBe(today);
		expect(parseMealDay('yesterday', today)).toBe(today);
		expect(parseMealDay('2026-1-5', today)).toBe(today);
	});

	it('falls back to today for impossible or future dates', () => {
		expect(parseMealDay('2026-02-30', today)).toBe(today);
		expect(parseMealDay('2026-11-19', today)).toBe(today);
	});

	it('accepts today and past dates', () => {
		expect(parseMealDay('2026-11-18', today)).toBe('2026-11-18');
		expect(parseMealDay('2025-12-31', today)).toBe('2025-12-31');
	});
});
