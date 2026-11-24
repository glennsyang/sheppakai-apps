import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockExpense = {
	amount: number;
	date?: string;
	category?: unknown;
	id?: string;
	payee?: string;
	notes?: string;
};
type MockBudget = {
	amount: number;
	month?: string;
	year?: string;
	category?: { id: string; name?: string };
};
type MockBillPrice = {
	amount: number;
	cadence: 'Monthly' | 'Yearly';
	effectiveFrom: string;
	effectiveTo: string | null;
	recurringBill: { id: string; merchant: string; payments: Array<{ period: string }> };
};
type MockGoal = { id: string; status: string; targetAmount: number };

const mockExpenseQueries = vi.hoisted(() => ({
	findByDateRangeIncludedInBudget: vi.fn<
		(startDate?: string, endDate?: string) => Promise<MockExpense[]>
	>(async () => []),
	findByDateRangeExcludedFromBudget: vi.fn<
		(startDate?: string, endDate?: string) => Promise<MockExpense[]>
	>(async () => [])
}));
const mockBudgetQueries = vi.hoisted(() => ({
	findByMonthYear: vi.fn<() => Promise<MockBudget[]>>(async () => []),
	findByYear: vi.fn<(year?: number) => Promise<MockBudget[]>>(async () => [])
}));
const mockRecurringBillQueries = vi.hoisted(() => ({
	findHistory: vi.fn<(fromKey?: string, toKey?: string) => Promise<MockBillPrice[]>>(async () => [])
}));
const mockIncomeQueries = vi.hoisted(() => ({
	findByDateRange: vi.fn<(startDate?: string, endDate?: string) => Promise<MockExpense[]>>(
		async () => []
	)
}));
const mockSavingsGoalQueries = vi.hoisted(() => ({
	findAll: vi.fn<() => Promise<MockGoal[]>>(async () => [])
}));
const mockSavingsAccountQueries = vi.hoisted(() => ({
	getTotal: vi.fn<() => Promise<number>>(async () => 0)
}));

vi.mock('#lib/server/db/queries/index.js', () => ({
	expenseQueries: mockExpenseQueries,
	budgetQueries: mockBudgetQueries,
	recurringBillQueries: mockRecurringBillQueries,
	incomeQueries: mockIncomeQueries,
	savingsGoalQueries: mockSavingsGoalQueries,
	savingsAccountQueries: mockSavingsAccountQueries
}));
vi.mock('#lib/server/db/index.js', () => ({ getDb: vi.fn<() => unknown>(() => undefined) }));
vi.mock('#lib/server/db/schema/index.js', () => ({ contribution: {} }));

import { getDashboardSummary, loadMonthlyDashboard, loadYearlyDashboard } from './summary';

// Internet went from $80 to $95 in May 2020; a $20 bill was cancelled after March 2020.
const internet = { id: 'r1', merchant: 'Internet', payments: [{ period: '2020-06' }] };
const gym = { id: 'r2', merchant: 'Gym', payments: [] };
const priceChangeHistory: MockBillPrice[] = [
	{
		amount: 80,
		cadence: 'Monthly',
		effectiveFrom: '2020-01',
		effectiveTo: '2020-04',
		recurringBill: internet
	},
	{
		amount: 95,
		cadence: 'Monthly',
		effectiveFrom: '2020-05',
		effectiveTo: null,
		recurringBill: internet
	},
	{
		amount: 20,
		cadence: 'Monthly',
		effectiveFrom: '2019-06',
		effectiveTo: '2020-03',
		recurringBill: gym
	}
];

describe('loadMonthlyDashboard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSavingsGoalQueries.findAll.mockResolvedValue([]);
		mockRecurringBillQueries.findHistory.mockResolvedValue([]);
		mockExpenseQueries.findByDateRangeIncludedInBudget.mockResolvedValue([]);
	});

	it('computes expense/income totals for the requested month', async () => {
		mockExpenseQueries.findByDateRangeIncludedInBudget.mockResolvedValue([
			{ amount: 100, date: '2020-06-05', category: undefined },
			{ amount: 50, date: '2020-06-15', category: undefined }
		]);
		mockBudgetQueries.findByMonthYear.mockResolvedValue([{ amount: 200 }]);
		mockIncomeQueries.findByDateRange.mockResolvedValue([{ amount: 500, date: '2020-06-10' }]);

		const result = await loadMonthlyDashboard(
			new URL('https://example.com/dashboard?month=6&year=2020')
		);

		expect(result.mode).toBe('monthly');
		expect(result.actualExpensesTotal).toBe(150);
		expect(result.plannedExpensesTotal).toBe(200);
		expect(result.totalIncome).toBe(500);
		expect(result.remainingBalance).toBe(300);
	});

	it('returns a Category Status for each budgeted or spent Category, riskiest first', async () => {
		const groceries = { id: 'c-groceries', name: 'Groceries' };
		const fuel = { id: 'c-fuel', name: 'Fuel' };
		const gifts = { id: 'c-gifts', name: 'Gifts' };
		mockExpenseQueries.findByDateRangeIncludedInBudget.mockResolvedValue([
			{ amount: 80, date: '2020-06-05', category: groceries },
			{ amount: 40, date: '2020-06-07', category: groceries },
			{ amount: 10, date: '2020-06-08', category: fuel },
			{ amount: 25, date: '2020-06-09', category: gifts }
		]);
		mockBudgetQueries.findByMonthYear.mockResolvedValue([
			{ amount: 100, category: groceries },
			{ amount: 50, category: fuel }
		]);

		const result = await loadMonthlyDashboard(
			new URL('https://example.com/dashboard?month=6&year=2020')
		);

		expect(result.categoryStatuses.map((s) => [s.categoryId, s.state, s.overBy])).toEqual([
			['c-groceries', 'over', 20],
			['c-fuel', 'ok', 0],
			['c-gifts', 'unbudgeted', 0]
		]);
	});

	it('has no forecast for a past month', async () => {
		const result = await loadMonthlyDashboard(
			new URL('https://example.com/dashboard?month=6&year=2020')
		);
		expect(result.forecast).toBeNull();
	});

	it('uses the bill prices in effect in each month', async () => {
		mockRecurringBillQueries.findHistory.mockResolvedValue(priceChangeHistory);

		const result = await loadMonthlyDashboard(
			new URL('https://example.com/dashboard?month=6&year=2020')
		);

		expect(mockRecurringBillQueries.findHistory).toHaveBeenCalledWith('2020-01', '2020-06');
		expect(result.recurringBillsMonthlyTotal).toBe(95);
		expect(result.actualExpensesTotal).toBe(95);
		expect(result.monthlyInOutData.map((d) => d.out)).toEqual([100, 100, 100, 80, 95, 95]);
		expect(result.recurringBills).toEqual([
			{ id: 'r1', merchant: 'Internet', amount: 95, cadence: 'Monthly', paid: true }
		]);
	});

	it('shows a past month at its own amounts, with that month unpaid', async () => {
		mockRecurringBillQueries.findHistory.mockResolvedValue(priceChangeHistory);

		const result = await loadMonthlyDashboard(
			new URL('https://example.com/dashboard?month=3&year=2020')
		);

		expect(result.recurringBillsMonthlyTotal).toBe(100);
		expect(result.recurringBills).toEqual([
			{ id: 'r2', merchant: 'Gym', amount: 20, cadence: 'Monthly', paid: false },
			{ id: 'r1', merchant: 'Internet', amount: 80, cadence: 'Monthly', paid: false }
		]);
	});

	describe('current month', () => {
		beforeEach(() => {
			vi.useFakeTimers({ now: new Date('2026-10-15T19:00:00Z'), toFake: ['Date'] });
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it('returns a forecast built from the baseline window and previous income', async () => {
			mockExpenseQueries.findByDateRangeIncludedInBudget.mockImplementation(
				async (startDate?: string) =>
					startDate === '2026-10-01' ? [{ amount: 1500, date: '2026-10-05' }] : []
			);
			mockIncomeQueries.findByDateRange.mockImplementation(async (startDate?: string) =>
				startDate === '2026-07-01'
					? [
							{ amount: 4000, date: '2026-07-15' },
							{ amount: 5000, date: '2026-09-15' }
						]
					: []
			);

			const result = await loadMonthlyDashboard(
				new URL('https://example.com/dashboard?month=10&year=2026')
			);

			expect(mockExpenseQueries.findByDateRangeIncludedInBudget).toHaveBeenCalledWith(
				'2026-07-02',
				'2026-09-30'
			);
			expect(mockIncomeQueries.findByDateRange).toHaveBeenCalledWith('2026-07-01', '2026-09-30');
			expect(result.forecast).not.toBeNull();
			// No baseline history → this month's pace: $100/day over 31 days
			expect(result.forecast?.dailyRate).toBe(100);
			expect(result.forecast?.totalEnd).toBe(3100);
			expect(result.forecast?.expectedIncome).toBe(3000);
		});
	});
});

describe('loadYearlyDashboard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSavingsGoalQueries.findAll.mockResolvedValue([]);
		mockRecurringBillQueries.findHistory.mockResolvedValue([]);
		mockExpenseQueries.findByDateRangeIncludedInBudget.mockResolvedValue([]);
	});

	it('computes expense/income totals for the requested year', async () => {
		mockExpenseQueries.findByDateRangeIncludedInBudget.mockResolvedValue([
			{ amount: 1200, date: '2020-03-15', category: undefined }
		]);
		mockIncomeQueries.findByDateRange.mockResolvedValue([{ amount: 6000, date: '2020-03-10' }]);

		const result = await loadYearlyDashboard(new URL('https://example.com/dashboard?year=2020'));

		expect(result.mode).toBe('yearly');
		expect(result.actualExpensesTotal).toBe(1200);
		expect(result.totalIncome).toBe(6000);
	});

	it('sums each month of a past year at the amounts in effect that month', async () => {
		mockRecurringBillQueries.findHistory.mockResolvedValue([
			...priceChangeHistory,
			{
				amount: 120,
				cadence: 'Yearly',
				effectiveFrom: '2020-01',
				effectiveTo: null,
				recurringBill: gym
			}
		]);

		const result = await loadYearlyDashboard(new URL('https://example.com/dashboard?year=2020'));

		expect(mockRecurringBillQueries.findHistory).toHaveBeenCalledWith('2020-01', '2020-12');
		// Internet 4 × 80 + 8 × 95, the cancelled bill 3 × 20, the yearly bill 12 × 10
		expect(result.actualExpensesTotal).toBe(320 + 760 + 60 + 120);
		expect(result.timeRangeData.map((d) => d.out).slice(0, 5)).toEqual([110, 110, 110, 90, 105]);
	});

	it('budgets each month as its category budgets plus recurring', async () => {
		mockRecurringBillQueries.findHistory.mockResolvedValue(priceChangeHistory);
		mockBudgetQueries.findByYear.mockResolvedValue([
			{ amount: 300, month: '03', year: '2020', category: { id: 'c1' } },
			{ amount: 200, month: '03', year: '2020', category: { id: 'c1' } },
			{ amount: 400, month: '05', year: '2020', category: { id: 'c1' } }
		]);

		const result = await loadYearlyDashboard(new URL('https://example.com/dashboard?year=2020'));

		// Recurring: 100 (Jan–Mar), 80 (Apr), 95 (May on)
		expect(result.timeRangeData.map((d) => d.budgeted).slice(0, 6)).toEqual([
			100,
			100,
			500 + 100,
			80,
			400 + 95,
			95
		]);
		expect(result.plannedExpensesTotal).toBe(900 + 320 + 760 + 60);
	});

	it('charts each Category per month with Over Budget from Category Status', async () => {
		const travel = { id: 'c-travel', name: 'Travel' };
		mockExpenseQueries.findByDateRangeIncludedInBudget.mockResolvedValue([
			{ amount: 150, date: '2020-02-10', category: travel },
			{ amount: 30, date: '2020-03-10', category: travel }
		]);
		mockBudgetQueries.findByYear.mockResolvedValue([
			{ amount: 100, month: '02', year: '2020', category: travel },
			{ amount: 100, month: '03', year: '2020', category: travel }
		]);

		const result = await loadYearlyDashboard(new URL('https://example.com/dashboard?year=2020'));

		expect(result.categoryMonthly['c-travel'].slice(0, 4)).toEqual([
			{ month: 'January', spent: 0, budget: undefined, overbudget: 0 },
			{ month: 'February', spent: 150, budget: 100, overbudget: 50 },
			{ month: 'March', spent: 30, budget: 100, overbudget: 0 },
			{ month: 'April', spent: 0, budget: undefined, overbudget: 0 }
		]);
	});

	it('returns excluded expenses lean and newest first, summing to the stat', async () => {
		mockExpenseQueries.findByDateRangeExcludedFromBudget.mockResolvedValue([
			{
				id: 't1',
				amount: 40,
				date: '2020-02-01',
				payee: 'Vet',
				notes: '',
				category: { id: 'c1', name: 'Pets' }
			},
			{ id: 't2', amount: 60, date: '2020-07-09', payee: 'Gift', notes: 'Birthday' },
			{
				id: 't3',
				amount: 25,
				date: '2020-05-20',
				payee: 'Vet',
				notes: '',
				category: { id: 'c1', name: 'Pets' }
			}
		]);

		const result = await loadYearlyDashboard(new URL('https://example.com/dashboard?year=2020'));

		expect(result.excludedExpenses).toEqual([
			{
				id: 't2',
				date: '2020-07-09',
				payee: 'Gift',
				notes: 'Birthday',
				amount: 60,
				categoryName: 'Uncategorized'
			},
			{ id: 't3', date: '2020-05-20', payee: 'Vet', notes: '', amount: 25, categoryName: 'Pets' },
			{ id: 't1', date: '2020-02-01', payee: 'Vet', notes: '', amount: 40, categoryName: 'Pets' }
		]);
		expect(result.excludedExpenses.reduce((acc, e) => acc + e.amount, 0)).toBe(
			result.excludedExpensesTotal
		);
	});

	describe('view=current crossing into the prior year', () => {
		beforeEach(() => {
			vi.useFakeTimers({ now: new Date('2026-02-15T19:00:00Z'), toFake: ['Date'] });
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it('budgets prior-year chart months from that year without changing yearly totals', async () => {
			mockBudgetQueries.findByYear.mockImplementation(async (year?: number) =>
				year === 2025
					? [
							{ amount: 700, month: '11', year: '2025', category: { id: 'c1' } },
							{ amount: 800, month: '12', year: '2025', category: { id: 'c1' } }
						]
					: [{ amount: 500, month: '01', year: '2026', category: { id: 'c1' } }]
			);

			const result = await loadYearlyDashboard(
				new URL('https://example.com/dashboard?mode=yearly&year=2026')
			);

			expect(mockBudgetQueries.findByYear).toHaveBeenCalledWith(2026);
			expect(mockBudgetQueries.findByYear).toHaveBeenCalledWith(2025);
			expect(result.timeRangeData.map((d) => [d.month, d.budgeted])).toEqual([
				['September', 0],
				['October', 0],
				['November', 700],
				['December', 800],
				['January', 500],
				['February', 0]
			]);
			expect(result.plannedExpensesTotal).toBe(500);
		});
	});
});

describe('getDashboardSummary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSavingsGoalQueries.findAll.mockResolvedValue([]);
		mockRecurringBillQueries.findHistory.mockResolvedValue([]);
		mockExpenseQueries.findByDateRangeIncludedInBudget.mockResolvedValue([]);
	});

	it('dispatches to the monthly summary by default', async () => {
		const result = await getDashboardSummary(
			new URL('https://example.com/dashboard?month=6&year=2020')
		);
		expect(result.mode).toBe('monthly');
	});

	it('dispatches to the yearly summary when mode=yearly', async () => {
		const result = await getDashboardSummary(
			new URL('https://example.com/dashboard?mode=yearly&year=2020')
		);
		expect(result.mode).toBe('yearly');
		expect(result).toHaveProperty('excludedExpenses');
		expect(result.mode === 'yearly' && result.timeRangeData[0]).toHaveProperty('budgeted');
	});
});
