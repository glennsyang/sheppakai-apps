import { and, asc, eq, isNull } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import { recurringQueries } from '#lib/server/db/queries/index.js';
import { recurring, recurringPayment, recurringVersion } from '#lib/server/db/schema/index.js';
import { withUpdatedAt } from '#lib/server/db/utils.js';
import { currentMonthKey, periodKey, previousMonthKey } from '#lib/server/recurring-history.js';
import type { Recurring } from '#lib/types.js';

/**
 * The single write path for recurring bills (#240). Every change applies from the current
 * month on: past months keep the version that was in effect, so their totals never move.
 */

export type RecurringInput = {
	merchant: string;
	description: string;
	cadence: Recurring['cadence'];
	amount: number;
	dueDay?: number | null;
	dueMonth?: number | null;
};

function toRecurringRow(input: RecurringInput) {
	return {
		merchant: input.merchant,
		description: input.description,
		cadence: input.cadence,
		amount: input.amount,
		dueDay: input.dueDay ?? null,
		dueMonth: input.dueMonth ?? null
	};
}

/** Insert a bill and its first version, effective from the current month. */
export function createRecurring(input: RecurringInput, userId: string, now = new Date()): string {
	const monthKey = currentMonthKey(now);

	return getDb().transaction((tx) => {
		const [inserted] = tx
			.insert(recurring)
			.values({ ...toRecurringRow(input), userId })
			.returning({ id: recurring.id })
			.all();
		tx.insert(recurringVersion)
			.values({
				recurringId: inserted.id,
				amount: input.amount,
				cadence: input.cadence,
				effectiveFrom: monthKey
			})
			.run();
		return inserted.id;
	});
}

/**
 * Update a bill. A new amount or cadence opens a new version from the current month and closes
 * the previous one at last month; if the open version already started this month it is edited
 * in place instead. Returns false when the bill doesn't exist or was deleted.
 */
export function updateRecurring(id: string, input: RecurringInput, now = new Date()): boolean {
	const monthKey = currentMonthKey(now);

	return getDb().transaction((tx) => {
		const updated = tx
			.update(recurring)
			.set(withUpdatedAt(toRecurringRow(input), now))
			.where(and(eq(recurring.id, id), isNull(recurring.endedAt)))
			.returning({ id: recurring.id })
			.all();
		if (updated.length === 0) return false;

		const open = tx
			.select()
			.from(recurringVersion)
			.where(and(eq(recurringVersion.recurringId, id), isNull(recurringVersion.effectiveTo)))
			.get();
		const values = { amount: input.amount, cadence: input.cadence };

		if (open && open.amount === input.amount && open.cadence === input.cadence) return true;

		if (open && open.effectiveFrom >= monthKey) {
			tx.update(recurringVersion).set(values).where(eq(recurringVersion.id, open.id)).run();
			return true;
		}

		if (open) {
			tx.update(recurringVersion)
				.set({ effectiveTo: previousMonthKey(monthKey) })
				.where(eq(recurringVersion.id, open.id))
				.run();
		}
		tx.insert(recurringVersion)
			.values({ recurringId: id, ...values, effectiveFrom: monthKey })
			.run();
		return true;
	});
}

/**
 * Delete a bill from the current month on. Past months keep counting it, so the row is
 * soft-deleted and its open version closed at last month. A bill whose history starts this
 * month has no past to keep and is removed outright.
 */
export function deleteRecurring(id: string, now = new Date()): void {
	const monthKey = currentMonthKey(now);

	getDb().transaction((tx) => {
		const first = tx
			.select({ effectiveFrom: recurringVersion.effectiveFrom })
			.from(recurringVersion)
			.where(eq(recurringVersion.recurringId, id))
			.orderBy(asc(recurringVersion.effectiveFrom))
			.get();

		if (!first || first.effectiveFrom >= monthKey) {
			tx.delete(recurring).where(eq(recurring.id, id)).run();
			return;
		}

		tx.update(recurringVersion)
			.set({ effectiveTo: previousMonthKey(monthKey) })
			.where(and(eq(recurringVersion.recurringId, id), isNull(recurringVersion.effectiveTo)))
			.run();
		tx.update(recurring)
			.set(withUpdatedAt({ endedAt: now }, now))
			.where(eq(recurring.id, id))
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
export async function markRecurringPaid(
	id: string,
	paid: boolean,
	now = new Date()
): Promise<Recurring | undefined> {
	const existing = await recurringQueries.findActiveById(id, now);
	if (!existing) return undefined;

	const period = periodKey(existing.cadence, currentMonthKey(now));

	if (paid) {
		await getDb()
			.insert(recurringPayment)
			.values({ recurringId: id, period, paidAt: now })
			.onConflictDoNothing();
	} else {
		await getDb()
			.delete(recurringPayment)
			.where(and(eq(recurringPayment.recurringId, id), eq(recurringPayment.period, period)));
	}

	return recurringQueries.findActiveById(id, now);
}
