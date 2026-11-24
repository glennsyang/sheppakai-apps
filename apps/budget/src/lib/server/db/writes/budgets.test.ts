// Runs the Budget write path and the duplicate cleanup migration against the real schema in an
// in-memory SQLite database, so the one-Budget-per-category-per-month rule is exercised for real (#380).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../schema';

const dbState = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('#lib/server/db/index.js', () => ({ getDb: () => dbState.db }));

import { saveBudget } from './budgets';

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
const groceriesMarch = { categoryId: 'cat-groceries', month: '03', year: '2026' };

let sqlite: Database.Database;
let db: TestDb;

function budgets() {
	return db
		.select({
			categoryId: schema.budget.categoryId,
			month: schema.budget.month,
			year: schema.budget.year,
			amount: schema.budget.amount,
			presetType: schema.budget.presetType,
			userId: schema.budget.userId
		})
		.from(schema.budget)
		.orderBy(asc(schema.budget.categoryId), asc(schema.budget.month))
		.all();
}

beforeEach(() => {
	sqlite = new Database(':memory:');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder });
	db.insert(schema.user)
		.values([
			{ id: 'user-a', name: 'Ada', email: 'ada@example.com', emailVerified: true },
			{ id: 'user-b', name: 'Bo', email: 'bo@example.com', emailVerified: true }
		])
		.run();
	db.insert(schema.category)
		.values([
			{ id: 'cat-groceries', name: 'Groceries', description: '' },
			{ id: 'cat-fuel', name: 'Fuel', description: '' }
		])
		.run();
	dbState.db = db;
});

describe('saveBudget', () => {
	it('creates the Budget when the category has none that month', () => {
		saveBudget({ ...groceriesMarch, amount: 100, presetType: 'custom' }, 'user-a');

		expect(budgets()).toEqual([
			{ ...groceriesMarch, amount: 100, presetType: 'custom', userId: 'user-a' }
		]);
	});

	it("updates user A's Budget when user B saves the same category and month", () => {
		saveBudget({ ...groceriesMarch, amount: 100, presetType: 'custom' }, 'user-a');

		saveBudget({ ...groceriesMarch, amount: 150, presetType: 'average' }, 'user-b');

		expect(budgets()).toEqual([
			{ ...groceriesMarch, amount: 150, presetType: 'average', userId: 'user-a' }
		]);
	});

	it('keeps separate Budgets for other categories and months', () => {
		saveBudget({ ...groceriesMarch, amount: 100 }, 'user-a');
		saveBudget({ ...groceriesMarch, month: '04', amount: 110 }, 'user-a');
		saveBudget({ ...groceriesMarch, categoryId: 'cat-fuel', amount: 60 }, 'user-b');

		expect(budgets().map(({ categoryId, month, amount }) => [categoryId, month, amount])).toEqual([
			['cat-fuel', '03', 60],
			['cat-groceries', '03', 100],
			['cat-groceries', '04', 110]
		]);
	});
});

describe('budget table', () => {
	it('rejects a second Budget for the same category and month', () => {
		db.insert(schema.budget)
			.values({ ...groceriesMarch, amount: 100, userId: 'user-a' })
			.run();

		expect(() =>
			db
				.insert(schema.budget)
				.values({ ...groceriesMarch, amount: 100, userId: 'user-b' })
				.run()
		).toThrow(/UNIQUE constraint failed/);
	});
});

describe('0028_budget_dedupe migration', () => {
	it('keeps only the most recently updated Budget per category and month', () => {
		// Recreate the pre-#380 state: no unique index, duplicates present.
		sqlite.exec('DROP INDEX `budget_category_period_unique`');
		const insert = (id: string, amount: number, updatedAt: string, month = '03') =>
			db
				.insert(schema.budget)
				.values({
					...groceriesMarch,
					id,
					month,
					amount,
					userId: 'user-a',
					updatedAt: new Date(updatedAt)
				})
				.run();
		insert('b-old', 100, '2026-03-01T00:00:00Z');
		insert('b-new', 150, '2026-03-05T00:00:00Z');
		insert('b-mid', 120, '2026-03-03T00:00:00Z');
		insert('b-april', 90, '2026-04-01T00:00:00Z', '04');

		sqlite.exec(readFileSync(`${migrationsFolder}/0028_budget_dedupe.sql`, 'utf8'));

		expect(
			db
				.select({ id: schema.budget.id, amount: schema.budget.amount })
				.from(schema.budget)
				.orderBy(asc(schema.budget.id))
				.all()
		).toEqual([
			{ id: 'b-april', amount: 90 },
			{ id: 'b-new', amount: 150 }
		]);
	});
});
