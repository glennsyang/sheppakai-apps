import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockTransaction = { amount: number; date?: string; category?: unknown };
type MockBudget = { amount: number };
type MockVersion = {
	amount: number;
	cadence: 'Monthly' | 'Yearly';
	effectiveFrom: string;
	effectiveTo: string | null;
	recurring: { id: string; merchant: string; payments: Array<{ period: string }> };
};
type MockGoal = { id: string; status: string; targetAmount: number };

const mockTransactionQueries = vi.hoisted(() => ({
	findByDateRangeIncludedInBudget: vi.fn<
		(startDate?: string, endDate?: string) => Promise<MockTransaction[]>
	>(async () => []),
	findByDateRangeExcludedFromBudget: vi.fn<
		(startDate?: string, endDate?: string) => Promise<MockTransaction[]>
	>(async () => [])
}));
const mockBudgetQueries = vi.hoisted(() => ({
	findByMonthYear: vi.fn<() => Promise<MockBudget[]>>(async () => []),
	findByYear: vi.fn<() => Promise<MockBudget[]>>(async () => [])
}));
const mockRecurringQueries = vi.hoisted(() => ({
	findHistory: vi.fn<(fromKey?: string, toKey?: string) => Promise<MockVersion[]>>(async () => [])
}));
const mockIncomeQueries = vi.hoisted(() => ({
	findByDateRange: vi.fn<(startDate?: string, endDate?: string) => Promise<MockTransaction[]>>(
		async () => []
	)
}));
const mockSavingsGoalQueries = vi.hoisted(() => ({
	findAll: vi.fn<() => Promise<MockGoal[]>>(async () => [])
}));
const mockSavingsQueries = vi.hoisted(() => ({
	getTotal: vi.fn<() => Promise<number>>(async () => 0)
}));

vi.mock('#lib/server/db/queries/index.js', () => ({
	transactionQueries: mockTransactionQueries,
	budgetQueries: mockBudgetQueries,
	recurringQueries: mockRecurringQueries,
	incomeQueries: mockIncomeQueries,
	savingsGoalQueries: mockSavingsGoalQueries,
	savingsQueries: mockSavingsQueries
}));
vi.mock('#lib/server/db/index.js', () => ({ getDb: vi.fn<() => unknown>(() => undefined) }));
vi.mock('#lib/server/db/schema/index.js', () => ({ contribution: {} }));

import { getDashboardSummary, loadMonthlyDashboard, loadYearlyDashboard } from './summary';

// Internet went from $80 to $95 in May 2020; a $20 bill was cancelled after March 2020.
const internet = { id: 'r1', merchant: 'Internet', payments: [{ period: '2020-06' }] };
const gym = { id: 'r2', merchant: 'Gym', payments: [] };
const priceChangeHistory: MockVersion[] = [
	{
		amount: 80,
		cadence: 'Monthly',
		effectiveFrom: '2020-01',
		effectiveTo: '2020-04',
		recurring: internet
	},
	{
		amount: 95,
		cadence: 'Monthly',
		effectiveFrom: '2020-05',
		effectiveTo: null,
		recurring: internet
	},
	{
		amount: 20,
		cadence: 'Monthly',
		effectiveFrom: '2019-06',
		effectiveTo: '2020-03',
		recurring: gym
	}
];

describe('loadMonthlyDashboard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSavingsGoalQueries.findAll.mockResolvedValue([]);
		mockRecurringQueries.findHistory.mockResolvedValue([]);
		mockTransactionQueries.findByDateRangeIncludedInBudget.mockResolvedValue([]);
	});

	it('computes expense/income totals for the requested month', async () => {
		mockTransactionQueries.findByDateRangeIncludedInBudget.mockResolvedValue([
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

	it('has no forecast for a past month', async () => {
		const result = await loadMonthlyDashboard(
			new URL('https://example.com/dashboard?month=6&year=2020')
		);
		expect(result.forecast).toBeNull();
	});

	it('uses the recurring versions in effect in each month', async () => {
		mockRecurringQueries.findHistory.mockResolvedValue(priceChangeHistory);

		const result = await loadMonthlyDashboard(
			new URL('https://example.com/dashboard?month=6&year=2020')
		);

		expect(mockRecurringQueries.findHistory).toHaveBeenCalledWith('2020-01', '2020-06');
		expect(result.recurringMonthlyTotal).toBe(95);
		expect(result.actualExpensesTotal).toBe(95);
		expect(result.monthlyInOutData.map((d) => d.out)).toEqual([100, 100, 100, 80, 95, 95]);
		expect(result.recurringExpenses).toEqual([
			{ id: 'r1', merchant: 'Internet', amount: 95, cadence: 'Monthly', paid: true }
		]);
	});

	it('shows a past month at its own amounts, with that month unpaid', async () => {
		mockRecurringQueries.findHistory.mockResolvedValue(priceChangeHistory);

		const result = await loadMonthlyDashboard(
			new URL('https://example.com/dashboard?month=3&year=2020')
		);

		expect(result.recurringMonthlyTotal).toBe(100);
		expect(result.recurringExpenses).toEqual([
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
			mockTransactionQueries.findByDateRangeIncludedInBudget.mockImplementation(
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

			expect(mockTransactionQueries.findByDateRangeIncludedInBudget).toHaveBeenCalledWith(
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
		mockRecurringQueries.findHistory.mockResolvedValue([]);
		mockTransactionQueries.findByDateRangeIncludedInBudget.mockResolvedValue([]);
	});

	it('computes expense/income totals for the requested year', async () => {
		mockTransactionQueries.findByDateRangeIncludedInBudget.mockResolvedValue([
			{ amount: 1200, date: '2020-03-15', category: undefined }
		]);
		mockIncomeQueries.findByDateRange.mockResolvedValue([{ amount: 6000, date: '2020-03-10' }]);

		const result = await loadYearlyDashboard(new URL('https://example.com/dashboard?year=2020'));

		expect(result.mode).toBe('yearly');
		expect(result.actualExpensesTotal).toBe(1200);
		expect(result.totalIncome).toBe(6000);
	});

	it('sums each month of a past year at the amounts in effect that month', async () => {
		mockRecurringQueries.findHistory.mockResolvedValue([
			...priceChangeHistory,
			{
				amount: 120,
				cadence: 'Yearly',
				effectiveFrom: '2020-01',
				effectiveTo: null,
				recurring: gym
			}
		]);

		const result = await loadYearlyDashboard(new URL('https://example.com/dashboard?year=2020'));

		expect(mockRecurringQueries.findHistory).toHaveBeenCalledWith('2020-01', '2020-12');
		// Internet 4 × 80 + 8 × 95, the cancelled bill 3 × 20, the yearly bill 12 × 10
		expect(result.actualExpensesTotal).toBe(320 + 760 + 60 + 120);
		expect(result.timeRangeData.map((d) => d.out).slice(0, 5)).toEqual([110, 110, 110, 90, 105]);
	});
});

describe('getDashboardSummary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSavingsGoalQueries.findAll.mockResolvedValue([]);
		mockRecurringQueries.findHistory.mockResolvedValue([]);
		mockTransactionQueries.findByDateRangeIncludedInBudget.mockResolvedValue([]);
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
	});
});
