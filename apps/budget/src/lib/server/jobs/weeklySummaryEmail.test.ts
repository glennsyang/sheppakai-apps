import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
	select: vi.fn<() => unknown>(),
	getCategoryStatuses: vi.fn<() => Promise<unknown[]>>(),
	sendWeeklySummaryEmail: vi.fn<(payload: { to: string }) => Promise<unknown>>(),
	loggerInfo: vi.fn<() => void>(),
	loggerWarn: vi.fn<() => void>(),
	loggerError: vi.fn<() => void>()
}));

vi.mock('#lib/server/db/index.js', () => ({
	getDb: () => ({ select: mockState.select })
}));

vi.mock('#lib/server/budgets/category-status.js', () => ({
	getCategoryStatuses: mockState.getCategoryStatuses
}));

vi.mock('#lib/server/email/index.js', () => ({
	sendWeeklySummaryEmail: mockState.sendWeeklySummaryEmail
}));

vi.mock('#lib/server/logger.js', () => ({
	logger: {
		debug: vi.fn<() => void>(),
		info: mockState.loggerInfo,
		warn: mockState.loggerWarn,
		error: mockState.loggerError
	}
}));

import type { SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

import { runWeeklySummaryEmail } from './weeklySummaryEmail';

// A query-builder stub matching the job's shapes:
// .from().where() and .from().innerJoin().where() — `where()` is always last.
function queryResult(rows: unknown[]) {
	const resolved = Promise.resolve(rows);
	return {
		from: () => ({
			where: () => resolved,
			innerJoin: () => ({ where: () => resolved })
		})
	};
}

// Like queryResult, but records the `where` condition so the filter itself can be asserted.
function capturingQueryResult(rows: unknown[], captured: { where?: SQL }) {
	return {
		from: () => ({
			where: (condition: SQL) => {
				captured.where = condition;
				return Promise.resolve(rows);
			}
		})
	};
}

const { buildCategoryStatuses } = await vi.importActual<
	typeof import('#lib/server/budgets/category-status.js')
>('#lib/server/budgets/category-status.js');

const MONDAY_PACIFIC = new Date('2026-09-14T16:10:00Z'); // 9:10am PDT, Monday
const TUESDAY_PACIFIC = new Date('2026-09-15T16:10:00Z');

describe('runWeeklySummaryEmail', () => {
	beforeEach(() => {
		mockState.select.mockReset();
		mockState.getCategoryStatuses.mockReset();
		mockState.getCategoryStatuses.mockResolvedValue([]);
		mockState.sendWeeklySummaryEmail.mockReset();
		mockState.loggerInfo.mockReset();
		mockState.loggerWarn.mockReset();
		mockState.loggerError.mockReset();
		mockState.sendWeeklySummaryEmail.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('skips without touching the database when it is not Monday Pacific time', async () => {
		const result = await runWeeklySummaryEmail(TUESDAY_PACIFIC);

		expect(result.skipped).toBe(true);
		expect(result.reason).toBe('Not Monday Pacific time');
		expect(mockState.select).not.toHaveBeenCalled();
	});

	it('skips when no budgets exist for the current month', async () => {
		mockState.select.mockReturnValueOnce(
			queryResult([{ name: 'Glenn', email: 'glenn@example.com' }])
		);

		const result = await runWeeklySummaryEmail(MONDAY_PACIFIC);

		expect(result.skipped).toBe(true);
		expect(result.reason).toBe('No budgets found for current month');
		expect(result.recipientsScanned).toBe(1);
		expect(mockState.sendWeeklySummaryEmail).not.toHaveBeenCalled();
	});

	it('only emails verified, non-banned users with an email address', async () => {
		const recipientsQuery: { where?: SQL } = {};
		mockState.select.mockReturnValueOnce(capturingQueryResult([], recipientsQuery));

		await runWeeklySummaryEmail(MONDAY_PACIFIC);

		expect(recipientsQuery.where).toBeDefined();
		const { sql, params } = new SQLiteSyncDialect().sqlToQuery(recipientsQuery.where as SQL);
		expect(sql).toContain('"email_verified" = ?');
		expect(sql).toContain('"banned" = ?');
		expect(params).toEqual([0, 1, '']);
	});

	it('classifies over-budget and near-limit categories and emails every recipient', async () => {
		mockState.select
			.mockReturnValueOnce(
				queryResult([
					{ name: 'Glenn', email: 'glenn@example.com' },
					{ name: 'Sam', email: 'sam@example.com' }
				])
			)
			.mockReturnValueOnce(
				queryResult([
					{ date: '2026-09-10', payee: 'Airline', categoryName: 'Travel', amount: 400 },
					{ date: '2026-09-02', payee: 'Hotel', categoryName: 'Travel', amount: 250 }
				])
			);

		mockState.getCategoryStatuses.mockResolvedValue(
			buildCategoryStatuses(
				[
					{ categoryId: 'cat-groceries', categoryName: 'Groceries', amount: 100 },
					{ categoryId: 'cat-fuel', categoryName: 'Fuel', amount: 50 },
					{ categoryId: 'cat-fun', categoryName: 'Fun', amount: 20 },
					{ categoryId: 'cat-gifts', categoryName: 'Gifts', amount: 0 }
				],
				[
					{ categoryId: 'cat-groceries', categoryName: 'Groceries', amount: 120 }, // over by 20
					{ categoryId: 'cat-fuel', categoryName: 'Fuel', amount: 48 }, // within 10% (>= 45)
					{ categoryId: 'cat-fun', categoryName: 'Fun', amount: 5 }, // well under threshold
					{ categoryId: 'cat-gifts', categoryName: 'Gifts', amount: 30 } // $0 Budget: unbudgeted, not over
				]
			)
		);

		const result = await runWeeklySummaryEmail(MONDAY_PACIFIC);

		expect(result.skipped).toBe(false);
		expect(result.overBudgetCount).toBe(1);
		expect(result.nearLimitCount).toBe(1);
		expect(result.excludedCount).toBe(2);
		expect(result.emailsSent).toBe(2);
		expect(result.emailsFailed).toBe(0);
		expect(mockState.sendWeeklySummaryEmail).toHaveBeenCalledTimes(2);

		const [firstCall] = mockState.sendWeeklySummaryEmail.mock.calls;
		expect(firstCall[0]).toMatchObject({
			to: 'glenn@example.com',
			overBudgetCategories: [
				expect.objectContaining({ categoryName: 'Groceries', overByAmount: 20 })
			],
			nearLimitCategories: [expect.objectContaining({ categoryName: 'Fuel' })],
			excludedExpenses: [
				expect.objectContaining({ payee: 'Hotel', date: '2026-09-02' }),
				expect.objectContaining({ payee: 'Airline', date: '2026-09-10' })
			]
		});
		expect(mockState.loggerInfo).toHaveBeenCalledWith(
			'Weekly summary email run completed',
			expect.objectContaining({ emailsFailed: 0 })
		);
		expect(mockState.loggerWarn).not.toHaveBeenCalled();
	});

	it('attributes a failed send to its recipient and logs the run as degraded', async () => {
		mockState.select
			.mockReturnValueOnce(
				queryResult([
					{ name: 'Glenn', email: 'glenn@example.com' },
					{ name: 'Sam', email: 'sam@example.com' }
				])
			)
			.mockReturnValueOnce(queryResult([]));
		mockState.getCategoryStatuses.mockResolvedValue(
			buildCategoryStatuses(
				[{ categoryId: 'cat-groceries', categoryName: 'Groceries', amount: 100 }],
				[]
			)
		);

		const sendError = new Error('Brevo rejected the request');
		mockState.sendWeeklySummaryEmail
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(sendError);

		const result = await runWeeklySummaryEmail(MONDAY_PACIFIC);

		expect(result.emailsSent).toBe(1);
		expect(result.emailsFailed).toBe(1);
		expect(mockState.loggerError).toHaveBeenCalledWith(
			'Failed to send weekly summary email to recipient',
			sendError,
			{ email: 'sam@example.com' }
		);
		expect(mockState.loggerWarn).toHaveBeenCalledWith(
			'Weekly summary email run completed with failures',
			expect.objectContaining({ emailsFailed: 1, emailsSent: 1 })
		);
		expect(mockState.loggerInfo).not.toHaveBeenCalledWith(
			'Weekly summary email run completed',
			expect.anything()
		);
	});

	it('asks Category Status for the month to date', async () => {
		mockState.select.mockReturnValueOnce(queryResult([]));

		await runWeeklySummaryEmail(MONDAY_PACIFIC);

		expect(mockState.getCategoryStatuses).toHaveBeenCalledWith({
			month: 9,
			year: 2026,
			through: '2026-09-14'
		});
	});
});
