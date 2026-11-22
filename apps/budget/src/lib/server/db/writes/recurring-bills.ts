import { and, asc, eq, gte, isNull, lte, or } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import { recurringBillQueries } from '#lib/server/db/queries/index.js';
import { billPayment, billPrice, recurringBill } from '#lib/server/db/schema/index.js';
import { withUpdatedAt } from '#lib/server/db/utils.js';
import {
	currentMonthKey,
	nextMonthKey,
	periodKey,
	previousMonthKey
} from '#lib/server/recurring-bill-history.js';
import type { RecurringBill } from '#lib/types.js';

/**
 * The single write path for recurring bills (#240). Every change applies from the current
 * month on: past months keep the price that was in effect, so their totals never move. The
 * one exception is `setRecurringBillAmountForMonth`, an explicit one-month correction of the past.
 */

export type RecurringBillInput = {
	merchant: string;
	description: string;
	cadence: RecurringBill['cadence'];
	amount: number;
	dueDay?: number | null;
	dueMonth?: number | null;
};

function toRecurringBillRow(input: RecurringBillInput) {
	return {
		merchant: input.merchant,
		description: input.description,
		cadence: input.cadence,
		amount: input.amount,
		dueDay: input.dueDay ?? null,
		dueMonth: input.dueMonth ?? null
	};
}

/** Insert a bill and its first price, effective from the current month. */
export function createRecurringBill(
	input: RecurringBillInput,
	userId: string,
	now = new Date()
): string {
	const monthKey = currentMonthKey(now);

	return getDb().transaction((tx) => {
		const [inserted] = tx
			.insert(recurringBill)
			.values({ ...toRecurringBillRow(input), userId })
			.returning({ id: recurringBill.id })
			.all();
		tx.insert(billPrice)
			.values({
				recurringBillId: inserted.id,
				amount: input.amount,
				cadence: input.cadence,
				effectiveFrom: monthKey
			})
			.run();
		return inserted.id;
	});
}

/**
 * Update a bill. A new amount or cadence opens a new price from the current month and closes
 * the previous one at last month; if the open price already started this month it is edited
 * in place instead. Returns false when the bill doesn't exist or was deleted.
 */
export function updateRecurringBill(
	id: string,
	input: RecurringBillInput,
	now = new Date()
): boolean {
	const monthKey = currentMonthKey(now);

	return getDb().transaction((tx) => {
		const updated = tx
			.update(recurringBill)
			.set(withUpdatedAt(toRecurringBillRow(input), now))
			.where(and(eq(recurringBill.id, id), isNull(recurringBill.endedAt)))
			.returning({ id: recurringBill.id })
			.all();
		if (updated.length === 0) return false;

		const open = tx
			.select()
			.from(billPrice)
			.where(and(eq(billPrice.recurringBillId, id), isNull(billPrice.effectiveTo)))
			.get();
		const values = { amount: input.amount, cadence: input.cadence };

		if (open && open.amount === input.amount && open.cadence === input.cadence) return true;

		if (open && open.effectiveFrom >= monthKey) {
			tx.update(billPrice).set(values).where(eq(billPrice.id, open.id)).run();
			return true;
		}

		if (open) {
			tx.update(billPrice)
				.set({ effectiveTo: previousMonthKey(monthKey) })
				.where(eq(billPrice.id, open.id))
				.run();
		}
		tx.insert(billPrice)
			.values({ recurringBillId: id, ...values, effectiveFrom: monthKey })
			.run();
		return true;
	});
}

export type PastAmountResult = 'updated' | 'not-found' | 'not-past';

/**
 * Correct a bill's amount for one past month only. The price in effect that month is split
 * into up to three: the months before keep the old amount, `monthKey` gets `amount`, and the
 * months after keep the old amount. Cadence and every other month are untouched. Returns
 * 'not-past' for the current or a future month (use `updateRecurringBill`), and 'not-found' when
 * the bill wasn't in effect in `monthKey`.
 */
export function setRecurringBillAmountForMonth(
	id: string,
	monthKey: string,
	amount: number,
	now = new Date()
): PastAmountResult {
	if (monthKey >= currentMonthKey(now)) return 'not-past';

	return getDb().transaction((tx) => {
		const price = tx
			.select()
			.from(billPrice)
			.where(
				and(
					eq(billPrice.recurringBillId, id),
					lte(billPrice.effectiveFrom, monthKey),
					or(isNull(billPrice.effectiveTo), gte(billPrice.effectiveTo, monthKey))
				)
			)
			.get();
		if (!price) return 'not-found';
		if (price.amount === amount) return 'updated';

		const { effectiveFrom, effectiveTo, cadence } = price;
		const pieces = [
			effectiveFrom < monthKey && {
				amount: price.amount,
				effectiveFrom,
				effectiveTo: previousMonthKey(monthKey)
			},
			{ amount, effectiveFrom: monthKey, effectiveTo: monthKey },
			(effectiveTo === null || effectiveTo > monthKey) && {
				amount: price.amount,
				effectiveFrom: nextMonthKey(monthKey),
				effectiveTo
			}
		].filter((piece) => piece !== false);

		tx.delete(billPrice).where(eq(billPrice.id, price.id)).run();
		tx.insert(billPrice)
			.values(pieces.map((piece) => ({ ...piece, recurringBillId: id, cadence })))
			.run();
		return 'updated';
	});
}

/**
 * Delete a bill from the current month on. Past months keep counting it, so the row is
 * soft-deleted and its open price closed at last month. A bill whose history starts this
 * month has no past to keep and is removed outright.
 */
export function deleteRecurringBill(id: string, now = new Date()): void {
	const monthKey = currentMonthKey(now);

	getDb().transaction((tx) => {
		const first = tx
			.select({ effectiveFrom: billPrice.effectiveFrom })
			.from(billPrice)
			.where(eq(billPrice.recurringBillId, id))
			.orderBy(asc(billPrice.effectiveFrom))
			.get();

		if (!first || first.effectiveFrom >= monthKey) {
			tx.delete(recurringBill).where(eq(recurringBill.id, id)).run();
			return;
		}

		tx.update(billPrice)
			.set({ effectiveTo: previousMonthKey(monthKey) })
			.where(and(eq(billPrice.recurringBillId, id), isNull(billPrice.effectiveTo)))
			.run();
		tx.update(recurringBill)
			.set(withUpdatedAt({ endedAt: now }, now))
			.where(eq(recurringBill.id, id))
			.run();
	});
}

/**
 * The single write path for paid/unpaid toggling, shared by the UI's `togglePaid` action and
 * the API. The API gates it behind the narrower `recurring:markPaid` scope rather than a
 * general `recurring:write` scope, so it never gets broader update access to other fields.
 *
 * Paid state is per period: the current month for Monthly bills, the current year for Yearly.
 */
export async function markRecurringBillPaid(
	id: string,
	paid: boolean,
	now = new Date()
): Promise<RecurringBill | undefined> {
	const existing = await recurringBillQueries.findActiveById(id, now);
	if (!existing) return undefined;

	const period = periodKey(existing.cadence, currentMonthKey(now));

	if (paid) {
		await getDb()
			.insert(billPayment)
			.values({ recurringBillId: id, period, paidAt: now })
			.onConflictDoNothing();
	} else {
		await getDb()
			.delete(billPayment)
			.where(and(eq(billPayment.recurringBillId, id), eq(billPayment.period, period)));
	}

	return recurringBillQueries.findActiveById(id, now);
}
