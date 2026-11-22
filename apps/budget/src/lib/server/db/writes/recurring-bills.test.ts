// Runs the recurring write path against the real schema and migrations in an in-memory SQLite
// database, so bill price history and per-period payments are exercised for real (#240).
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../schema';

const dbState = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('#lib/server/db/index.js', () => ({ getDb: () => dbState.db }));

import { recurringBillQueries } from '../queries';
import {
	createRecurringBill,
	deleteRecurringBill,
	markRecurringBillPaid,
	setRecurringBillAmountForMonth,
	updateRecurringBill
} from './recurring-bills';

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

function prices(recurringBillId: string) {
	return db
		.select({
			amount: schema.billPrice.amount,
			cadence: schema.billPrice.cadence,
			effectiveFrom: schema.billPrice.effectiveFrom,
			effectiveTo: schema.billPrice.effectiveTo
		})
		.from(schema.billPrice)
		.where(eq(schema.billPrice.recurringBillId, recurringBillId))
		.orderBy(asc(schema.billPrice.effectiveFrom))
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

describe('createRecurringBill', () => {
	it('opens a price from the current month', () => {
		const id = createRecurringBill(input, 'u1', JAN);

		expect(prices(id)).toEqual([
			{ amount: 80, cadence: 'Monthly', effectiveFrom: '2026-01', effectiveTo: null }
		]);
	});
});

describe('updateRecurringBill', () => {
	it('closes the old price and opens a new one when the amount changes later', () => {
		const id = createRecurringBill(input, 'u1', JAN);

		expect(updateRecurringBill(id, { ...input, amount: 95 }, MAR)).toBe(true);

		expect(prices(id)).toEqual([
			{ amount: 80, cadence: 'Monthly', effectiveFrom: '2026-01', effectiveTo: '2026-02' },
			{ amount: 95, cadence: 'Monthly', effectiveFrom: '2026-03', effectiveTo: null }
		]);
	});

	it('edits the open price in place when it started this month', () => {
		const id = createRecurringBill(input, 'u1', JAN);

		updateRecurringBill(id, { ...input, amount: 85, cadence: 'Yearly', dueMonth: 6 }, JAN);

		expect(prices(id)).toEqual([
			{ amount: 85, cadence: 'Yearly', effectiveFrom: '2026-01', effectiveTo: null }
		]);
	});

	it('leaves history alone when only the merchant or due day changes', () => {
		const id = createRecurringBill(input, 'u1', JAN);

		updateRecurringBill(id, { ...input, merchant: 'ISP', dueDay: 9 }, MAR);

		expect(prices(id)).toHaveLength(1);
	});

	it('returns false for a missing or deleted bill', () => {
		const id = createRecurringBill(input, 'u1', JAN);
		deleteRecurringBill(id, MAR);

		expect(updateRecurringBill(id, input, MAR)).toBe(false);
		expect(updateRecurringBill('missing', input, MAR)).toBe(false);
	});
});

describe('deleteRecurringBill', () => {
	it('soft-deletes a bill with history so past months keep counting it', async () => {
		const id = createRecurringBill(input, 'u1', JAN);

		deleteRecurringBill(id, MAR);

		expect(prices(id)).toEqual([
			{ amount: 80, cadence: 'Monthly', effectiveFrom: '2026-01', effectiveTo: '2026-02' }
		]);
		expect(await recurringBillQueries.findActive(MAR)).toEqual([]);
		const history = await recurringBillQueries.findHistory('2026-01', '2026-03');
		expect(history).toHaveLength(1);
	});

	it('removes a bill outright when its history starts this month', () => {
		const id = createRecurringBill(input, 'u1', MAR);

		deleteRecurringBill(id, MAR);

		expect(db.select().from(schema.recurringBill).all()).toEqual([]);
		expect(prices(id)).toEqual([]);
	});
});

describe('markRecurringBillPaid', () => {
	it('records paid state for the current month only on a monthly bill', async () => {
		const id = createRecurringBill(input, 'u1', JAN);

		const paid = await markRecurringBillPaid(id, true, JAN);
		expect(paid?.paid).toBe(true);

		const nextMonth = await recurringBillQueries.findActiveById(
			id,
			new Date('2026-02-15T20:00:00Z')
		);
		expect(nextMonth?.paid).toBe(false);
	});

	it('keeps a yearly bill paid for the rest of the year', async () => {
		const id = createRecurringBill({ ...input, cadence: 'Yearly', dueMonth: 1 }, 'u1', JAN);

		await markRecurringBillPaid(id, true, JAN);

		expect((await recurringBillQueries.findActiveById(id, MAR))?.paid).toBe(true);
		expect(
			(await recurringBillQueries.findActiveById(id, new Date('2027-01-15T20:00:00Z')))?.paid
		).toBe(false);
	});

	it('is idempotent and can be undone', async () => {
		const id = createRecurringBill(input, 'u1', JAN);

		await markRecurringBillPaid(id, true, JAN);
		await markRecurringBillPaid(id, true, JAN);
		expect(db.select().from(schema.billPayment).all()).toHaveLength(1);

		const unpaid = await markRecurringBillPaid(id, false, JAN);
		expect(unpaid?.paid).toBe(false);
		expect(db.select().from(schema.billPayment).all()).toEqual([]);
	});

	it('returns undefined when the bill does not exist', async () => {
		expect(await markRecurringBillPaid('missing', true, JAN)).toBeUndefined();
	});
});

describe('recurringBillQueries.findForMonth', () => {
	it('shows a past month at its own amount and paid state', async () => {
		const id = createRecurringBill(input, 'u1', JAN);
		await markRecurringBillPaid(id, true, JAN);
		updateRecurringBill(id, { ...input, amount: 95 }, MAR);

		const january = await recurringBillQueries.findForMonth('2026-01', MAR);
		expect(january).toMatchObject([{ id, amount: 80, paid: true }]);

		const current = await recurringBillQueries.findForMonth('2026-03', MAR);
		expect(current).toMatchObject([{ id, amount: 95, paid: false }]);
	});

	it('keeps a deleted bill in the months it was active, and nothing before it existed', async () => {
		const id = createRecurringBill(input, 'u1', JAN);
		deleteRecurringBill(id, MAR);

		expect(await recurringBillQueries.findForMonth('2026-02', MAR)).toMatchObject([{ id }]);
		expect(await recurringBillQueries.findForMonth('2025-12', MAR)).toEqual([]);
		expect(await recurringBillQueries.findForMonth('2026-03', MAR)).toEqual([]);
	});
});

describe('setRecurringBillAmountForMonth', () => {
	it('splits an open price so only that month changes', async () => {
		const id = createRecurringBill(input, 'u1', JAN);

		expect(setRecurringBillAmountForMonth(id, '2026-02', 70, MAR)).toBe('updated');

		expect(prices(id)).toEqual([
			{ amount: 80, cadence: 'Monthly', effectiveFrom: '2026-01', effectiveTo: '2026-01' },
			{ amount: 70, cadence: 'Monthly', effectiveFrom: '2026-02', effectiveTo: '2026-02' },
			{ amount: 80, cadence: 'Monthly', effectiveFrom: '2026-03', effectiveTo: null }
		]);
		expect(await recurringBillQueries.findForMonth('2026-02', MAR)).toMatchObject([{ amount: 70 }]);
		expect(await recurringBillQueries.findForMonth('2026-03', MAR)).toMatchObject([{ amount: 80 }]);
	});

	it('splits a closed price at its first month and edits a one-month price in place', () => {
		const id = createRecurringBill(input, 'u1', JAN);
		updateRecurringBill(id, { ...input, amount: 95 }, MAR);

		setRecurringBillAmountForMonth(id, '2026-01', 75, MAR);
		setRecurringBillAmountForMonth(id, '2026-01', 76, MAR);

		expect(prices(id)).toEqual([
			{ amount: 76, cadence: 'Monthly', effectiveFrom: '2026-01', effectiveTo: '2026-01' },
			{ amount: 80, cadence: 'Monthly', effectiveFrom: '2026-02', effectiveTo: '2026-02' },
			{ amount: 95, cadence: 'Monthly', effectiveFrom: '2026-03', effectiveTo: null }
		]);
	});

	it('works on a deleted bill for a month it was in effect', () => {
		const id = createRecurringBill(input, 'u1', JAN);
		deleteRecurringBill(id, MAR);

		expect(setRecurringBillAmountForMonth(id, '2026-02', 60, MAR)).toBe('updated');
		expect(prices(id)).toEqual([
			{ amount: 80, cadence: 'Monthly', effectiveFrom: '2026-01', effectiveTo: '2026-01' },
			{ amount: 60, cadence: 'Monthly', effectiveFrom: '2026-02', effectiveTo: '2026-02' }
		]);
	});

	it('refuses the current or a future month, and months the bill was not in effect', () => {
		const id = createRecurringBill(input, 'u1', JAN);

		expect(setRecurringBillAmountForMonth(id, '2026-03', 70, MAR)).toBe('not-past');
		expect(setRecurringBillAmountForMonth(id, '2026-05', 70, MAR)).toBe('not-past');
		expect(setRecurringBillAmountForMonth(id, '2025-12', 70, MAR)).toBe('not-found');
		expect(prices(id)).toHaveLength(1);
	});
});
