// Category Status against real schema rows in an in-memory SQLite database (#371).
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../db/schema';

const state = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock('#lib/server/db/index.js', () => ({ getDb: () => state.db }));

import {
	buildCategoryStatuses,
	classifyCategoryStatus,
	getCategoryStatus,
	getCategoryStatuses
} from './category-status';

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let db: TestDb;
let expenseSeq = 0;

function insertBudget(categoryId: string, amount: number, month = '03', year = '2026') {
	db.insert(schema.budget).values({ userId: 'user-a', categoryId, amount, month, year }).run();
}

function insertExpense(
	categoryId: string,
	amount: number,
	date = '2026-03-10',
	excludedFromBudget = false
) {
	expenseSeq += 1;
	db.insert(schema.expense)
		.values({
			id: `tx-${expenseSeq}`,
			userId: 'user-b',
			categoryId,
			amount,
			payee: 'Store',
			notes: '',
			date,
			excludedFromBudget
		})
		.run();
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
		.values([
			{ id: 'cat-groceries', name: 'Groceries', description: '' },
			{ id: 'cat-fuel', name: 'Fuel', description: '' },
			{ id: 'cat-travel', name: 'Travel', description: '' },
			{ id: 'cat-gifts', name: 'Gifts', description: '' },
			{ id: 'cat-unused', name: 'Unused', description: '' }
		])
		.run();
	state.db = db;
});

describe('classifyCategoryStatus', () => {
	it.each([
		[100, 0, 'ok'],
		[100, 89.99, 'ok'],
		[100, 90, 'near'],
		[100, 100, 'near'],
		[100, 100.01, 'over'],
		[0, 0, 'empty'],
		[0, 25, 'unbudgeted'],
		[-5, 25, 'unbudgeted']
	] as const)('budgeted %d, spent %d → %s', (budgeted, spent, expected) => {
		expect(classifyCategoryStatus(budgeted, spent)).toBe(expected);
	});
});

describe('getCategoryStatuses', () => {
	it('leaves Excluded Expenses out of spent', async () => {
		insertBudget('cat-travel', 100);
		insertExpense('cat-travel', 40);
		insertExpense('cat-travel', 900, '2026-03-12', true);

		const [travel] = await getCategoryStatuses({ month: 3, year: 2026 });

		expect(travel).toMatchObject({ categoryId: 'cat-travel', spent: 40, state: 'ok' });
	});

	it('reports a Category with spend but no Budget as unbudgeted, never over', async () => {
		insertExpense('cat-fuel', 60);
		insertBudget('cat-gifts', 0);
		insertExpense('cat-gifts', 30);

		const statuses = await getCategoryStatuses({ month: 3, year: 2026 });

		expect(statuses.map((s) => [s.categoryId, s.state, s.overBy, s.pctUsed])).toEqual([
			['cat-fuel', 'unbudgeted', 0, 0],
			['cat-gifts', 'unbudgeted', 0, 0]
		]);
	});

	it('leaves out Categories with neither a Budget nor spend', async () => {
		insertBudget('cat-groceries', 100);

		const statuses = await getCategoryStatuses({ month: 3, year: 2026 });

		expect(statuses.map((s) => s.categoryId)).toEqual(['cat-groceries']);
		expect(statuses[0]).toMatchObject({ budgeted: 100, spent: 0, state: 'ok' });
	});

	it('works out Over Budget and sorts the riskiest first', async () => {
		insertBudget('cat-groceries', 100);
		insertExpense('cat-groceries', 70);
		insertExpense('cat-groceries', 50); // 120: over by 20
		insertBudget('cat-fuel', 50);
		insertExpense('cat-fuel', 95); // over by 45
		insertBudget('cat-travel', 200);
		insertExpense('cat-travel', 190); // near, 95%
		insertBudget('cat-gifts', 100);
		insertExpense('cat-gifts', 10); // ok, 10%

		const statuses = await getCategoryStatuses({ month: 3, year: 2026 });

		expect(statuses.map((s) => [s.categoryId, s.state, s.overBy])).toEqual([
			['cat-fuel', 'over', 45],
			['cat-groceries', 'over', 20],
			['cat-travel', 'near', 0],
			['cat-gifts', 'ok', 0]
		]);
		expect(statuses[1].pctUsed).toBe(120);
	});

	it('only counts the requested month, up to `through`', async () => {
		insertBudget('cat-groceries', 100);
		insertExpense('cat-groceries', 30, '2026-03-01');
		insertExpense('cat-groceries', 40, '2026-03-14 18:30:00');
		insertExpense('cat-groceries', 500, '2026-03-20');
		insertExpense('cat-groceries', 700, '2026-04-01');

		const [toDate] = await getCategoryStatuses({ month: 3, year: 2026, through: '2026-03-14' });
		const [wholeMonth] = await getCategoryStatuses({ month: 3, year: 2026 });

		expect(toDate.spent).toBe(70);
		expect(wholeMonth.spent).toBe(570);
	});

	it('relies on the database to keep one Budget per Category per month', () => {
		insertBudget('cat-groceries', 100);

		expect(() => insertBudget('cat-groceries', 50)).toThrow(/UNIQUE/);
	});
});

describe('getCategoryStatus', () => {
	it('returns one Category, with Budgets and spend from any Household member', async () => {
		insertBudget('cat-groceries', 100);
		insertExpense('cat-groceries', 95);
		insertBudget('cat-fuel', 10);
		insertExpense('cat-fuel', 99);

		const status = await getCategoryStatus('cat-groceries', 3, 2026);

		expect(status).toMatchObject({
			categoryName: 'Groceries',
			budgeted: 100,
			spent: 95,
			state: 'near'
		});
	});

	it('returns null when the Category has neither a Budget nor spend', async () => {
		expect(await getCategoryStatus('cat-unused', 3, 2026)).toBeNull();
	});
});

describe('buildCategoryStatuses', () => {
	it('drops Excluded Expenses passed in unfiltered', () => {
		const [status] = buildCategoryStatuses(
			[{ categoryId: 'c', categoryName: 'C', amount: 100 }],
			[
				{ categoryId: 'c', categoryName: 'C', amount: 20, excludedFromBudget: false },
				{ categoryId: 'c', categoryName: 'C', amount: 500, excludedFromBudget: true }
			]
		);

		expect(status).toMatchObject({ spent: 20, state: 'ok' });
	});
});
