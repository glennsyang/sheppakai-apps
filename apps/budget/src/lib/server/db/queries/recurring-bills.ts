import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';

import {
	currentMonthKey,
	recurringBillsForMonth,
	toMonthKey,
	withPaid
} from '#lib/server/recurring-bill-history.js';
import type { RecurringBill } from '#lib/types.js';

import { getDb } from '../index';
import { billPayment, billPrice, recurringBill } from '../schema';

/** The payment periods a month can match: `YYYY-MM` for Monthly bills, `YYYY` for Yearly. */
function periodsFor(monthKeys: string[]): string[] {
	return [...new Set(monthKeys.flatMap((key) => [key, key.slice(0, 4)]))];
}

function paymentsIn(periods: string[]) {
	return {
		columns: { period: true },
		where: inArray(billPayment.period, periods)
	} as const;
}

/** Every `YYYY-MM` key from `fromKey` to `toKey`, inclusive. */
function monthKeysBetween(fromKey: string, toKey: string): string[] {
	const keys: string[] = [];
	let [year, month] = fromKey.split('-').map(Number);
	for (let key = fromKey; key <= toKey; key = toMonthKey(month, year)) {
		keys.push(key);
		month += 1;
		if (month === 13) {
			month = 1;
			year += 1;
		}
	}
	return keys;
}

/**
 * RecurringBill prices that overlap `fromKey`..`toKey` (inclusive `YYYY-MM`), each with its
 * bill and the bill's payments for periods in that range. Feed the result to
 * `recurringBillsForMonth` and `recurringBillsTotalForMonth`.
 */
async function findHistory(fromKey: string, toKey: string) {
	return getDb().query.billPrice.findMany({
		where: and(
			lte(billPrice.effectiveFrom, toKey),
			or(isNull(billPrice.effectiveTo), gte(billPrice.effectiveTo, fromKey))
		),
		with: {
			recurringBill: {
				with: { user: true, payments: paymentsIn(periodsFor(monthKeysBetween(fromKey, toKey))) }
			}
		}
	});
}

/** Bills that haven't been deleted, with their current values and current-period paid state. */
async function findActive(now: Date = new Date()): Promise<RecurringBill[]> {
	const monthKey = currentMonthKey(now);
	const rows = await getDb().query.recurringBill.findMany({
		where: isNull(recurringBill.endedAt),
		with: { user: true, payments: paymentsIn(periodsFor([monthKey])) },
		orderBy: [asc(recurringBill.merchant)]
	});
	return rows.map((row) => withPaid(row, row.cadence, monthKey));
}

async function findActiveById(
	id: string,
	now: Date = new Date()
): Promise<RecurringBill | undefined> {
	const monthKey = currentMonthKey(now);
	const row = await getDb().query.recurringBill.findFirst({
		where: and(eq(recurringBill.id, id), isNull(recurringBill.endedAt)),
		with: { user: true, payments: paymentsIn(periodsFor([monthKey])) }
	});
	return row ? withPaid(row, row.cadence, monthKey) : undefined;
}

/**
 * The bills in effect in `monthKey`. The current month reads live bills; any other month is
 * rebuilt from bill price history, at that month's amount, cadence and paid state.
 */
async function findForMonth(monthKey: string, now: Date = new Date()): Promise<RecurringBill[]> {
	if (monthKey === currentMonthKey(now)) return findActive(now);
	return recurringBillsForMonth(await findHistory(monthKey, monthKey), monthKey);
}

export const recurringBillQueries = {
	findActive,
	findActiveById,
	findForMonth,
	findHistory
};
