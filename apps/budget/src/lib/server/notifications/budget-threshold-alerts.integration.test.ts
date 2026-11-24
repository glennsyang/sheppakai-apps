// Runs the Budget threshold alert against real schema rows in an in-memory SQLite database, so the
// Budget lookup is exercised for real instead of through a mocked findMany (#370).
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../db/schema';

const state = vi.hoisted(() => ({
	db: undefined as unknown,
	sendBudgetAlerts: vi.fn<() => Promise<boolean>>()
}));

vi.mock('#lib/server/db/index.js', () => ({ getDb: () => state.db }));
vi.mock('./index', () => ({ sendBudgetAlerts: state.sendBudgetAlerts }));

import {
	buildExpenseBudgetAlertUpdateContext,
	evaluateCreatedExpenseBudgetAlert,
	evaluateUpdatedExpenseBudgetAlert
} from './budget-threshold-alerts';

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let db: TestDb;

function insertExpense(id: string, userId: string, amount: number) {
	const row = {
		id,
		userId,
		categoryId: 'cat-groceries',
		amount,
		payee: 'Store',
		notes: '',
		date: '2026-03-10',
		excludedFromBudget: false
	};
	db.insert(schema.expense).values(row).run();
	return row;
}

beforeEach(() => {
	db = drizzle(new Database(':memory:'), { schema });
	migrate(db, { migrationsFolder: fileURLToPath(new URL('../db/migrations', import.meta.url)) });
	db.insert(schema.user)
		.values([
			{ id: 'user-a', name: 'Ada', email: 'ada@example.com', emailVerified: true },
			{ id: 'user-b', name: 'Bo', email: 'bo@example.com', emailVerified: true }
		])
		.run();
	db.insert(schema.category)
		.values({ id: 'cat-groceries', name: 'Groceries', description: '' })
		.run();
	// User A sets the Budget.
	db.insert(schema.budget)
		.values({
			userId: 'user-a',
			categoryId: 'cat-groceries',
			amount: 100,
			month: '03',
			year: '2026'
		})
		.run();
	state.db = db;
	state.sendBudgetAlerts.mockReset();
	state.sendBudgetAlerts.mockResolvedValue(true);
});

describe('Budget threshold alert across Household members', () => {
	it('alerts when user B logs an Expense against a Budget user A created', async () => {
		const created = insertExpense('tx-1', 'user-b', 95);

		await evaluateCreatedExpenseBudgetAlert(created);

		expect(state.sendBudgetAlerts).toHaveBeenCalledWith(
			expect.stringContaining('Groceries reached 95% of the March 2026 budget'),
			'Category at 90% of budget',
			3
		);
	});

	it('alerts when user B edits their Expense over a Budget user A created', async () => {
		insertExpense('tx-1', 'user-b', 50);
		const context = await buildExpenseBudgetAlertUpdateContext('tx-1');
		db.update(schema.expense).set({ amount: 120 }).run();

		await evaluateUpdatedExpenseBudgetAlert({ amount: 120 }, context);

		expect(state.sendBudgetAlerts).toHaveBeenCalledWith(
			expect.stringContaining('Groceries is over the March 2026 budget at 120%'),
			'Category over budget',
			4
		);
	});

	it('does not alert when spend stays below 90% of the Budget', async () => {
		const created = insertExpense('tx-1', 'user-b', 40);

		await evaluateCreatedExpenseBudgetAlert(created);

		expect(state.sendBudgetAlerts).not.toHaveBeenCalled();
	});
});
