import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
	getCategoryStatus: vi.fn<() => Promise<unknown>>(),
	expenseFindFirst: vi.fn<() => Promise<unknown>>(),
	sendBudgetAlerts: vi.fn<() => Promise<boolean>>(),
	loggerInfo: vi.fn<() => void>(),
	loggerError: vi.fn<() => void>()
}));

vi.mock('#lib/server/db/index.js', () => ({
	getDb: () => ({
		query: {
			expense: {
				findFirst: mockState.expenseFindFirst
			}
		}
	})
}));

vi.mock('#lib/server/budgets/category-status.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/budgets/category-status.js')>()),
	getCategoryStatus: mockState.getCategoryStatus
}));

/** What getCategoryStatus returns for a Category with a Budget and that much counted spend. */
function statusOf(categoryName: string, budgeted: number, spent: number) {
	return { categoryId: 'category-1', categoryName, budgeted, spent };
}

vi.mock('#lib/server/logger.js', () => ({
	logger: {
		info: mockState.loggerInfo,
		error: mockState.loggerError
	}
}));

vi.mock('./index', () => ({
	sendBudgetAlerts: mockState.sendBudgetAlerts
}));

import {
	buildExpenseBudgetAlertUpdateContext,
	evaluateCreatedExpenseBudgetAlert,
	evaluateUpdatedExpenseBudgetAlert,
	getBudgetThresholdAlertType,
	getBudgetThresholdState
} from './budget-threshold-alerts';

describe('budget-threshold-alerts', () => {
	beforeEach(() => {
		mockState.getCategoryStatus.mockReset();
		mockState.expenseFindFirst.mockReset();
		mockState.sendBudgetAlerts.mockReset();
		mockState.loggerInfo.mockReset();
		mockState.loggerError.mockReset();

		mockState.sendBudgetAlerts.mockResolvedValue(true);
	});

	it('classifies threshold states correctly', () => {
		expect(getBudgetThresholdState(89, 100)).toBe('below');
		expect(getBudgetThresholdState(90, 100)).toBe('near');
		expect(getBudgetThresholdState(100, 100)).toBe('near');
		expect(getBudgetThresholdState(101, 100)).toBe('over');
	});

	it('derives upward-only alert types correctly', () => {
		expect(getBudgetThresholdAlertType('below', 'near')).toBe('near');
		expect(getBudgetThresholdAlertType('below', 'over')).toBe('over');
		expect(getBudgetThresholdAlertType('near', 'over')).toBe('over');
		expect(getBudgetThresholdAlertType('near', 'near')).toBeNull();
		expect(getBudgetThresholdAlertType('over', 'near')).toBeNull();
	});

	it('sends a 90 percent alert when a create crosses into the near-threshold range', async () => {
		mockState.getCategoryStatus.mockResolvedValue(statusOf('Groceries', 100, 90));

		await evaluateCreatedExpenseBudgetAlert({
			id: 'tx-1',
			userId: 'user-1',
			categoryId: 'cat-1',
			amount: 10,
			date: '2026-03-10 08:15:00',
			excludedFromBudget: false
		});

		expect(mockState.sendBudgetAlerts).toHaveBeenCalledWith(
			'Groceries reached 90% of the March 2026 budget: $90.00 of $100.00 spent.',
			'Category at 90% of budget',
			3
		);
	});

	it('sends only the over-budget alert when a create jumps from below 90 to above 100', async () => {
		mockState.getCategoryStatus.mockResolvedValue(statusOf('Groceries', 100, 110));

		await evaluateCreatedExpenseBudgetAlert({
			id: 'tx-2',
			userId: 'user-1',
			categoryId: 'cat-1',
			amount: 30,
			date: '2026-03-11 12:00:00',
			excludedFromBudget: false
		});

		expect(mockState.sendBudgetAlerts).toHaveBeenCalledWith(
			'Groceries is over the March 2026 budget at 110%: $110.00 of $100.00 spent.',
			'Category over budget',
			4
		);
	});

	it('skips notifications when no budget exists for the category-month', async () => {
		mockState.getCategoryStatus.mockResolvedValue(null);

		await evaluateCreatedExpenseBudgetAlert({
			id: 'tx-3',
			userId: 'user-1',
			categoryId: 'cat-1',
			amount: 25,
			date: '2026-03-12 10:00:00',
			excludedFromBudget: false
		});

		expect(mockState.sendBudgetAlerts).not.toHaveBeenCalled();
	});

	it('skips threshold alerts for expenses marked as excluded from budget', async () => {
		await evaluateCreatedExpenseBudgetAlert({
			id: 'tx-3b',
			userId: 'user-1',
			categoryId: 'cat-1',
			amount: 25,
			date: '2026-03-12 10:00:00',
			excludedFromBudget: true
		});

		expect(mockState.sendBudgetAlerts).not.toHaveBeenCalled();
	});

	it('passes through the previous expense snapshot for update evaluation', async () => {
		mockState.expenseFindFirst.mockResolvedValue({
			id: 'tx-4',
			userId: 'user-1',
			categoryId: 'cat-1',
			amount: 5,
			date: '2026-03-10 08:15:00',
			excludedFromBudget: false
		});

		const result = await buildExpenseBudgetAlertUpdateContext('tx-4');

		expect(result).toEqual({
			previousExpense: {
				id: 'tx-4',
				userId: 'user-1',
				categoryId: 'cat-1',
				amount: 5,
				date: '2026-03-10 08:15:00',
				excludedFromBudget: false
			}
		});
	});

	it('sends a 90 percent alert when an update increases spend in the same bucket across the threshold', async () => {
		mockState.getCategoryStatus.mockResolvedValue(statusOf('Groceries', 100, 95));

		await evaluateUpdatedExpenseBudgetAlert(
			{
				amount: 15,
				categoryId: 'cat-1',
				date: '2026-03-10 08:15:00'
			},
			{
				previousExpense: {
					id: 'tx-5',
					userId: 'user-1',
					categoryId: 'cat-1',
					amount: 5,
					date: '2026-03-10 08:15:00',
					excludedFromBudget: false
				}
			}
		);

		expect(mockState.sendBudgetAlerts).toHaveBeenCalledWith(
			'Groceries reached 95% of the March 2026 budget: $95.00 of $100.00 spent.',
			'Category at 90% of budget',
			3
		);
	});

	it('evaluates the new bucket only when an update moves an expense to another category-month', async () => {
		mockState.getCategoryStatus.mockResolvedValue(statusOf('Dining Out', 100, 105));

		await evaluateUpdatedExpenseBudgetAlert(
			{
				amount: 25,
				categoryId: 'cat-2',
				date: '2026-04-01 09:00:00'
			},
			{
				previousExpense: {
					id: 'tx-6',
					userId: 'user-1',
					categoryId: 'cat-1',
					amount: 10,
					date: '2026-03-30 09:00:00',
					excludedFromBudget: false
				}
			}
		);

		expect(mockState.sendBudgetAlerts).toHaveBeenCalledWith(
			'Dining Out is over the April 2026 budget at 105%: $105.00 of $100.00 spent.',
			'Category over budget',
			4
		);
	});

	it('returns below when budgetAmount is zero (guard branch)', () => {
		expect(getBudgetThresholdState(50, 0)).toBe('below');
		expect(getBudgetThresholdState(0, 0)).toBe('below');
	});

	it('logs an error and returns early when previousExpense context is missing', async () => {
		await evaluateUpdatedExpenseBudgetAlert(
			{ amount: 20, categoryId: 'cat-1', date: '2026-03-15 10:00:00' },
			{ previousExpense: null }
		);

		expect(mockState.loggerError).toHaveBeenCalled();
		expect(mockState.sendBudgetAlerts).not.toHaveBeenCalled();
	});

	it('logs an error and returns early when context is undefined', async () => {
		await evaluateUpdatedExpenseBudgetAlert({
			amount: 20,
			categoryId: 'cat-1',
			date: '2026-03-15 10:00:00'
		});

		expect(mockState.loggerError).toHaveBeenCalled();
		expect(mockState.sendBudgetAlerts).not.toHaveBeenCalled();
	});
});
