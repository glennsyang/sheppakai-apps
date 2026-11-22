import { describe, expect, it } from 'vitest';

import type { Budget, Expense } from '#lib/types.js';

import { computeSpendingSpikes, type HistoricalMonthRange } from './spending-spikes';

const fixtureUser: Expense['user'] = {
	id: 'user-1',
	name: 'Test User',
	email: 'test@example.com',
	emailVerified: true,
	image: null,
	role: 'user',
	banned: false,
	banReason: null,
	banExpires: null,
	createdAt: new Date('2026-01-01'),
	updatedAt: new Date('2026-01-01')
};

const audit = { createdAt: new Date(0), updatedAt: new Date(0) };

function buildTx(categoryId: string, categoryName: string, amount: number, date: string): Expense {
	return {
		id: `${categoryId}-${date}`,
		amount,
		payee: 'Test Payee',
		notes: '',
		date,
		gstAmount: null,
		excludedFromBudget: false,
		categoryId,
		category: { id: categoryId, name: categoryName, description: '', ...audit },
		userId: fixtureUser.id,
		...audit,
		user: fixtureUser
	};
}

// Jan-Jun 2026, with June as the "current" month.
const sixMonthRange: HistoricalMonthRange[] = [
	{ monthStart: '2026-01-01', monthEnd: '2026-01-31' },
	{ monthStart: '2026-02-01', monthEnd: '2026-02-28' },
	{ monthStart: '2026-03-01', monthEnd: '2026-03-31' },
	{ monthStart: '2026-04-01', monthEnd: '2026-04-30' },
	{ monthStart: '2026-05-01', monthEnd: '2026-05-31' },
	{ monthStart: '2026-06-01', monthEnd: '2026-06-30' }
];

const priorMonthStarts = sixMonthRange.slice(0, -1).map((range) => range.monthStart);

function buildPriorMonthsSpend(
	categoryId: string,
	categoryName: string,
	amount: number
): Expense[] {
	return priorMonthStarts.map((monthStart) =>
		buildTx(categoryId, categoryName, amount, monthStart)
	);
}

function buildBudget(categoryId: string, categoryName: string, amount: number): Budget {
	return {
		id: `budget-${categoryId}`,
		amount,
		month: '6',
		year: '2026',
		presetType: null,
		categoryId,
		category: { id: categoryId, name: categoryName, description: '', ...audit },
		userId: fixtureUser.id,
		...audit,
		user: fixtureUser
	};
}

describe('computeSpendingSpikes', () => {
	it('flags a category spending more than 25% over its trailing average', () => {
		const expenses = [
			...buildPriorMonthsSpend('groceries', 'Groceries', 100),
			buildTx('groceries', 'Groceries', 140, '2026-06-15')
		];

		const spikes = computeSpendingSpikes(expenses, sixMonthRange);

		expect(spikes).toEqual([
			{
				categoryId: 'groceries',
				categoryName: 'Groceries',
				currentAmount: 140,
				trailingAverage: 100,
				percentOver: 40
			}
		]);
	});

	it('does not flag a category within 25% of its trailing average', () => {
		const expenses = [
			...buildPriorMonthsSpend('dining', 'Dining Out', 100),
			buildTx('dining', 'Dining Out', 120, '2026-06-15')
		];

		expect(computeSpendingSpikes(expenses, sixMonthRange)).toEqual([]);
	});

	it('ignores categories whose trailing average is below the minimum baseline', () => {
		const expenses = [
			...buildPriorMonthsSpend('parking', 'Parking', 10),
			buildTx('parking', 'Parking', 50, '2026-06-15')
		];

		expect(computeSpendingSpikes(expenses, sixMonthRange)).toEqual([]);
	});

	it('returns no spikes when there is not enough prior-month history', () => {
		const shortRange = sixMonthRange.slice(-3); // only 2 prior months
		const expenses = [
			buildTx('groceries', 'Groceries', 100, '2026-04-15'),
			buildTx('groceries', 'Groceries', 100, '2026-05-15'),
			buildTx('groceries', 'Groceries', 500, '2026-06-15')
		];

		expect(computeSpendingSpikes(expenses, shortRange)).toEqual([]);
	});

	it('sorts by percent-over descending and caps at 5 results', () => {
		const expenses = Array.from({ length: 6 }, (_, i) => {
			const categoryId = `cat-${i}`;
			// Trailing average of 50, current spend increasing with i so percentOver descends as i increases: cat-0 is highest.
			const currentAmount = 150 - i * 10;
			return [
				...buildPriorMonthsSpend(categoryId, `Category ${i}`, 50),
				buildTx(categoryId, `Category ${i}`, currentAmount, '2026-06-15')
			];
		}).flat();

		const spikes = computeSpendingSpikes(expenses, sixMonthRange);

		expect(spikes).toHaveLength(5);
		expect(spikes.map((a) => a.categoryId)).toEqual(['cat-0', 'cat-1', 'cat-2', 'cat-3', 'cat-4']);
		expect(spikes).toEqual([...spikes].sort((a, b) => b.percentOver - a.percentOver));
	});

	it('does not flag a category spending at or under its budget for the current month', () => {
		const expenses = [
			...buildPriorMonthsSpend('groceries', 'Groceries', 100),
			buildTx('groceries', 'Groceries', 140, '2026-06-15')
		];
		const budgets = [buildBudget('groceries', 'Groceries', 140)];

		expect(computeSpendingSpikes(expenses, sixMonthRange, budgets)).toEqual([]);
	});

	it('still flags a category that spends over both its trailing average and its budget', () => {
		const expenses = [
			...buildPriorMonthsSpend('groceries', 'Groceries', 100),
			buildTx('groceries', 'Groceries', 140, '2026-06-15')
		];
		const budgets = [buildBudget('groceries', 'Groceries', 120)];

		const spikes = computeSpendingSpikes(expenses, sixMonthRange, budgets);

		expect(spikes).toEqual([
			{
				categoryId: 'groceries',
				categoryName: 'Groceries',
				currentAmount: 140,
				trailingAverage: 100,
				percentOver: 40
			}
		]);
	});

	it('falls back to average-only detection when no budget is set for the category', () => {
		const expenses = [
			...buildPriorMonthsSpend('groceries', 'Groceries', 100),
			buildTx('groceries', 'Groceries', 140, '2026-06-15')
		];

		const spikes = computeSpendingSpikes(expenses, sixMonthRange, []);

		expect(spikes).toEqual([
			{
				categoryId: 'groceries',
				categoryName: 'Groceries',
				currentAmount: 140,
				trailingAverage: 100,
				percentOver: 40
			}
		]);
	});
});
