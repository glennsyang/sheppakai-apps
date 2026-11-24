import { describe, expect, it } from 'vitest';

import type { Budget } from '#lib/types.js';

import {
	buildCategoryHistory,
	completedMonthsAverage,
	monthlyAverage,
	monthWindow,
	previousMonth,
	suggestPreset
} from './category-history';

const budget = (categoryId: string, month: string, year: string, amount: number) =>
	({ categoryId, category: { id: categoryId }, month, year, amount, presetType: null }) as Budget;

const total = (categoryId: string, month: string, year: string, amount: number) => ({
	categoryId,
	month,
	year,
	total: amount
});

describe('monthWindow', () => {
	it('ends at the given month and crosses the year boundary, oldest first', () => {
		const window = monthWindow(2, 2026, 4);
		expect(window.map((m) => `${m.year}-${m.month}`)).toEqual([
			'2025-11',
			'2025-12',
			'2026-01',
			'2026-02'
		]);
		expect(window[0].date.toISOString()).toBe('2025-11-01T12:00:00.000Z');
	});
});

describe('previousMonth', () => {
	it('rolls January back to December of the year before', () => {
		expect(previousMonth(1, 2026)).toEqual({ month: '12', year: '2025' });
		expect(previousMonth(7, 2026)).toEqual({ month: '06', year: '2026' });
	});
});

describe('monthlyAverage', () => {
	it('counts empty months after the first month with spend as zero', () => {
		expect(monthlyAverage([100, 0, 200])).toBe(100);
	});

	it('drops months before the first month with spend', () => {
		expect(monthlyAverage([0, 0, 0, 90, 30])).toBe(60);
	});

	it('is 0 when nothing was spent', () => {
		expect(monthlyAverage([])).toBe(0);
		expect(monthlyAverage([0, 0])).toBe(0);
	});

	it('rounds to cents', () => {
		expect(monthlyAverage([10, 10, 0])).toBe(6.67);
	});
});

describe('buildCategoryHistory', () => {
	it('builds Preset amounts from the full months before the selected month', () => {
		const history = buildCategoryHistory({
			month: 3,
			year: 2026,
			windowMonths: 3,
			expenseTotals: [
				total('food', '11', '2025', 999), // outside the window
				total('food', '01', '2026', 100),
				total('food', '02', '2026', 200),
				total('food', '03', '2026', 5000) // selected month never counts
			],
			budgets: [budget('food', '2', '2026', 250), budget('food', '3', '2026', 300)]
		});

		expect(history.get('food')).toEqual({
			lastMonthSpent: 200,
			lastMonthBudget: 250,
			averageSpent: 150 // (0 + 100 + 200) / 2: December is before the first spend
		});
	});

	it('includes a Category with a Budget last month but no spend', () => {
		const history = buildCategoryHistory({
			month: 1,
			year: 2026,
			expenseTotals: [],
			budgets: [budget('gas', '12', '2025', 80)]
		});

		expect(history.get('gas')).toEqual({ lastMonthSpent: 0, lastMonthBudget: 80, averageSpent: 0 });
	});
});

describe('suggestPreset', () => {
	const amounts = { lastMonthSpent: 100, lastMonthBudget: 120, averageSpent: 90 };

	it('is null without a Budget', () => {
		expect(suggestPreset(undefined, amounts)).toBeNull();
	});

	it('uses the stored presetType when there is one', () => {
		expect(suggestPreset({ amount: 100, presetType: 'average' }, amounts)).toBe('average');
	});

	it('infers a legacy Budget from the Preset amounts', () => {
		expect(suggestPreset({ amount: 100, presetType: null }, amounts)).toBe('lastMonth');
		expect(suggestPreset({ amount: 120, presetType: null }, amounts)).toBe('lastMonthBudget');
		expect(suggestPreset({ amount: 90, presetType: null }, amounts)).toBe('average');
		expect(suggestPreset({ amount: 55, presetType: null }, amounts)).toBe('custom');
	});

	it('does not match a zero Preset amount', () => {
		const empty = { lastMonthSpent: 0, lastMonthBudget: 0, averageSpent: 0 };
		expect(suggestPreset({ amount: 0, presetType: null }, empty)).toBeNull();
	});
});

describe('completedMonthsAverage', () => {
	const e = (date: string, amount: number, excludedFromBudget = false) => ({
		date,
		amount,
		excludedFromBudget
	});

	it("ignores the current month's and future-dated Expenses", () => {
		const expenses = [
			e('2026-01-10', 300),
			e('2026-02-10', 100),
			e('2026-03-05', 5000), // current month (2 completed months)
			e('2026-12-01', 800) // future-dated
		];
		expect(completedMonthsAverage(expenses, 2026, 2)).toBe(200);
	});

	it('ignores Excluded Expenses and other years', () => {
		const expenses = [e('2026-01-10', 300), e('2026-01-11', 900, true), e('2025-01-10', 700)];
		expect(completedMonthsAverage(expenses, 2026, 1)).toBe(300);
	});

	it('is null with no completed months or no spend', () => {
		expect(completedMonthsAverage([e('2026-01-10', 300)], 2026, 0)).toBeNull();
		expect(completedMonthsAverage([], 2026, 5)).toBeNull();
	});
});
