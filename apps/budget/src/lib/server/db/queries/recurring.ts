import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';

import { currentMonthKey, toMonthKey, withPaid } from '#lib/server/recurring-history.js';
import type { Recurring } from '#lib/types.js';

import { getDb } from '../index';
import { recurring, recurringPayment, recurringVersion } from '../schema';

/** The payment periods a month can match: `YYYY-MM` for Monthly bills, `YYYY` for Yearly. */
function periodsFor(monthKeys: string[]): string[] {
	return [...new Set(monthKeys.flatMap((key) => [key, key.slice(0, 4)]))];
}

function paymentsIn(periods: string[]) {
	return {
		columns: { period: true },
		where: inArray(recurringPayment.period, periods)
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
 * Recurring versions that overlap `fromKey`..`toKey` (inclusive `YYYY-MM`), each with its
 * bill and the bill's payments for periods in that range. Feed the result to
 * `recurringForMonth` and `recurringTotalForMonth`.
 */
async function findHistory(fromKey: string, toKey: string) {
	return getDb().query.recurringVersion.findMany({
		where: and(
			lte(recurringVersion.effectiveFrom, toKey),
			or(isNull(recurringVersion.effectiveTo), gte(recurringVersion.effectiveTo, fromKey))
		),
		with: {
			recurring: {
				with: { user: true, payments: paymentsIn(periodsFor(monthKeysBetween(fromKey, toKey))) }
			}
		}
	});
}

/** Bills that haven't been deleted, with their current values and current-period paid state. */
async function findActive(now: Date = new Date()): Promise<Recurring[]> {
	const monthKey = currentMonthKey(now);
	const rows = await getDb().query.recurring.findMany({
		where: isNull(recurring.endedAt),
		with: { user: true, payments: paymentsIn(periodsFor([monthKey])) },
		orderBy: [asc(recurring.merchant)]
	});
	return rows.map((row) => withPaid(row, row.cadence, monthKey));
}

async function findActiveById(id: string, now: Date = new Date()): Promise<Recurring | undefined> {
	const monthKey = currentMonthKey(now);
	const row = await getDb().query.recurring.findFirst({
		where: and(eq(recurring.id, id), isNull(recurring.endedAt)),
		with: { user: true, payments: paymentsIn(periodsFor([monthKey])) }
	});
	return row ? withPaid(row, row.cadence, monthKey) : undefined;
}

export const recurringQueries = {
	findActive,
	findActiveById,
	findHistory
};
