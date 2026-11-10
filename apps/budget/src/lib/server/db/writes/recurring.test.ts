// Runs the recurring write path against the real schema and migrations in an in-memory SQLite
// database, so version history and per-period payments are exercised for real (#240).
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../schema';

const dbState = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('#lib/server/db/index.js', () => ({ getDb: () => dbState.db }));

import { recurringQueries } from '../queries';
import { createRecurring, deleteRecurring, markRecurringPaid, updateRecurring } from './recurring';

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

const JAN = new Date('2026-01-15T20:00:00Z');
const MAR = new Date('2026-03-15T20:00:00Z');
const input = {
	merchant: 'Internet',
	description: 'Fibre',
	cadence: 'Monthly' as const,
	amount: 80,
	dueDay: 5
};

let db: TestDb;

function versions(recurringId: string) {
	return db
		.select({
			amount: schema.recurringVersion.amount,
			cadence: schema.recurringVersion.cadence,
			effectiveFrom: schema.recurringVersion.effectiveFrom,
			effectiveTo: schema.recurringVersion.effectiveTo
		})
		.from(schema.recurringVersion)
		.where(eq(schema.recurringVersion.recurringId, recurringId))
		.orderBy(asc(schema.recurringVersion.effectiveFrom))
		.all();
}

beforeEach(() => {
	db = drizzle(new Database(':memory:'), { schema });
	migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) });
	db.insert(schema.user)
		.values({ id: 'u1', name: 'Ada', email: 'ada@example.com', emailVerified: true })
		.run();
	dbState.db = db;
});

describe('createRecurring', () => {
	it('opens a version from the current month', () => {
		const id = createRecurring(input, 'u1', JAN);

		expect(versions(id)).toEqual([
			{ amount: 80, cadence: 'Monthly', effectiveFrom: '2026-01', effectiveTo: null }
		]);
	});
});

describe('updateRecurring', () => {
	it('closes the old version and opens a new one when the amount changes later', () => {
		const id = createRecurring(input, 'u1', JAN);

		expect(updateRecurring(id, { ...input, amount: 95 }, MAR)).toBe(true);

		expect(versions(id)).toEqual([
			{ amount: 80, cadence: 'Monthly', effectiveFrom: '2026-01', effectiveTo: '2026-02' },
			{ amount: 95, cadence: 'Monthly', effectiveFrom: '2026-03', effectiveTo: null }
		]);
	});

	it('edits the open version in place when it started this month', () => {
		const id = createRecurring(input, 'u1', JAN);

		updateRecurring(id, { ...input, amount: 85, cadence: 'Yearly', dueMonth: 6 }, JAN);

		expect(versions(id)).toEqual([
			{ amount: 85, cadence: 'Yearly', effectiveFrom: '2026-01', effectiveTo: null }
		]);
	});

	it('leaves history alone when only the merchant or due day changes', () => {
		const id = createRecurring(input, 'u1', JAN);

		updateRecurring(id, { ...input, merchant: 'ISP', dueDay: 9 }, MAR);

		expect(versions(id)).toHaveLength(1);
	});

	it('returns false for a missing or deleted bill', () => {
		const id = createRecurring(input, 'u1', JAN);
		deleteRecurring(id, MAR);

		expect(updateRecurring(id, input, MAR)).toBe(false);
		expect(updateRecurring('missing', input, MAR)).toBe(false);
	});
});

describe('deleteRecurring', () => {
	it('soft-deletes a bill with history so past months keep counting it', async () => {
		const id = createRecurring(input, 'u1', JAN);

		deleteRecurring(id, MAR);

		expect(versions(id)).toEqual([
			{ amount: 80, cadence: 'Monthly', effectiveFrom: '2026-01', effectiveTo: '2026-02' }
		]);
		expect(await recurringQueries.findActive(MAR)).toEqual([]);
		const history = await recurringQueries.findHistory('2026-01', '2026-03');
		expect(history).toHaveLength(1);
	});

	it('removes a bill outright when its history starts this month', () => {
		const id = createRecurring(input, 'u1', MAR);

		deleteRecurring(id, MAR);

		expect(db.select().from(schema.recurring).all()).toEqual([]);
		expect(versions(id)).toEqual([]);
	});
});

describe('markRecurringPaid', () => {
	it('records paid state for the current month only on a monthly bill', async () => {
		const id = createRecurring(input, 'u1', JAN);

		const paid = await markRecurringPaid(id, true, JAN);
		expect(paid?.paid).toBe(true);

		const nextMonth = await recurringQueries.findActiveById(id, new Date('2026-02-15T20:00:00Z'));
		expect(nextMonth?.paid).toBe(false);
	});

	it('keeps a yearly bill paid for the rest of the year', async () => {
		const id = createRecurring({ ...input, cadence: 'Yearly', dueMonth: 1 }, 'u1', JAN);

		await markRecurringPaid(id, true, JAN);

		expect((await recurringQueries.findActiveById(id, MAR))?.paid).toBe(true);
		expect(
			(await recurringQueries.findActiveById(id, new Date('2027-01-15T20:00:00Z')))?.paid
		).toBe(false);
	});

	it('is idempotent and can be undone', async () => {
		const id = createRecurring(input, 'u1', JAN);

		await markRecurringPaid(id, true, JAN);
		await markRecurringPaid(id, true, JAN);
		expect(db.select().from(schema.recurringPayment).all()).toHaveLength(1);

		const unpaid = await markRecurringPaid(id, false, JAN);
		expect(unpaid?.paid).toBe(false);
		expect(db.select().from(schema.recurringPayment).all()).toEqual([]);
	});

	it('returns undefined when the bill does not exist', async () => {
		expect(await markRecurringPaid('missing', true, JAN)).toBeUndefined();
	});
});

describe('recurringQueries.findForMonth', () => {
	it('shows a past month at its own amount and paid state', async () => {
		const id = createRecurring(input, 'u1', JAN);
		await markRecurringPaid(id, true, JAN);
		updateRecurring(id, { ...input, amount: 95 }, MAR);

		const january = await recurringQueries.findForMonth('2026-01', MAR);
		expect(january).toMatchObject([{ id, amount: 80, paid: true }]);

		const current = await recurringQueries.findForMonth('2026-03', MAR);
		expect(current).toMatchObject([{ id, amount: 95, paid: false }]);
	});

	it('keeps a deleted bill in the months it was active, and nothing before it existed', async () => {
		const id = createRecurring(input, 'u1', JAN);
		deleteRecurring(id, MAR);

		expect(await recurringQueries.findForMonth('2026-02', MAR)).toMatchObject([{ id }]);
		expect(await recurringQueries.findForMonth('2025-12', MAR)).toEqual([]);
		expect(await recurringQueries.findForMonth('2026-03', MAR)).toEqual([]);
	});
});
