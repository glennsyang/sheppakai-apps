// Both ways of saving an Expense — the `/expenses` form actions and `POST /api/v1/expenses` — go
// through the Expense write module, so both raise the Budget threshold alert (#373). Runs the real
// actions, handler, write module and alert against an in-memory SQLite database; only the push
// send, the API-key check and the audit log are stubbed.
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

vi.mock('$app/env/private', () => ({}));
vi.mock('#lib/server/db/index.js', () => ({ getDb: () => state.db }));
vi.mock('./index', () => ({ sendBudgetAlerts: state.sendBudgetAlerts }));
vi.mock('#lib/server/api/require-api-key.js', () => ({
	requireApiKey: async () => ({ ok: true, apiKeyId: 'key-1', userId: 'user-b' })
}));
vi.mock('#lib/server/api/audit-log', () => ({ recordApiWrite: async () => undefined }));

import { actions } from '../../../routes/(app)/expenses/+page.server';
import { POST } from '../../../routes/api/v1/expenses/+server';

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let db: TestDb;

const expenseFields = {
	payee: 'Store',
	notes: 'Weekly shop',
	date: '2026-03-10',
	categoryId: 'cat-groceries',
	excludedFromBudget: false
};

function formEvent(action: string, fields: Record<string, string | number | boolean>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, String(value));
	const url = new URL(`https://budget.example.com/expenses?/${action}`);
	return {
		request: new Request(url, { method: 'POST', body }),
		url,
		locals: { user: { id: 'user-b' } }
	} as never;
}

function apiPost(fields: Record<string, unknown>) {
	const url = new URL('https://budget.example.com/api/v1/expenses');
	const request = new Request(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(fields)
	});
	return POST({ request, url, params: {} } as never);
}

const ninetyPercentAlert = [
	expect.stringContaining('Groceries reached 95% of the March 2026 budget'),
	'Category at 90% of budget',
	3
];

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

describe('Budget alert on the form-action path', () => {
	it('alerts when an Expense created on /expenses crosses 90% of the Budget', async () => {
		const result = await actions.create(formEvent('create', { ...expenseFields, amount: 95 }));

		expect(result).toMatchObject({ form: { message: { type: 'success' } } });
		expect(state.sendBudgetAlerts).toHaveBeenCalledWith(...ninetyPercentAlert);
	});

	it('alerts when an Expense edited on /expenses crosses 90% of the Budget', async () => {
		db.insert(schema.expense)
			.values({ ...expenseFields, id: 'tx-1', userId: 'user-b', amount: 40 })
			.run();

		const result = await actions.update(
			formEvent('update', { ...expenseFields, id: 'tx-1', amount: 95 })
		);

		expect(result).toMatchObject({ form: { message: { type: 'success' } } });
		expect(state.sendBudgetAlerts).toHaveBeenCalledWith(...ninetyPercentAlert);
	});
});

describe('Budget alert on the API path', () => {
	it('alerts when an Expense created through POST /api/v1/expenses crosses 90% of the Budget', async () => {
		const response = await apiPost({ ...expenseFields, amount: 95 });

		expect(response.status).toBe(201);
		expect(state.sendBudgetAlerts).toHaveBeenCalledWith(...ninetyPercentAlert);
	});
});
