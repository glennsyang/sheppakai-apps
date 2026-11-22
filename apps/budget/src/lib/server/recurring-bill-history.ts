import { getPacificTodayDate, padMonth } from '#lib/utils/dates.js';

/**
 * Pure helpers for recurring bill history (#240). Months are `YYYY-MM` keys, which sort and
 * compare correctly as strings. Payment periods are `YYYY-MM` for Monthly bills and `YYYY`
 * for Yearly bills.
 */

type Cadence = 'Monthly' | 'Yearly';

export type BillPriceRange = { effectiveFrom: string; effectiveTo: string | null };
export type BillPriceAmount = { amount: number; cadence: Cadence };

export function toMonthKey(month: number, year: number): string {
	return `${year}-${padMonth(month)}`;
}

/** The current month in Pacific time, as a `YYYY-MM` key. */
export function currentMonthKey(now: Date = new Date()): string {
	return getPacificTodayDate(now).slice(0, 7);
}

export function previousMonthKey(monthKey: string): string {
	const [year, month] = monthKey.split('-').map(Number);
	return month === 1 ? toMonthKey(12, year - 1) : toMonthKey(month - 1, year);
}

export function nextMonthKey(monthKey: string): string {
	const [year, month] = monthKey.split('-').map(Number);
	return month === 12 ? toMonthKey(1, year + 1) : toMonthKey(month + 1, year);
}

/** The payment period a bill of `cadence` falls in during `monthKey`. */
export function periodKey(cadence: Cadence, monthKey: string): string {
	return cadence === 'Yearly' ? monthKey.slice(0, 4) : monthKey;
}

export function isActiveIn(price: BillPriceRange, monthKey: string): boolean {
	return (
		price.effectiveFrom <= monthKey && (price.effectiveTo === null || price.effectiveTo >= monthKey)
	);
}

/** A price's share of one month: Monthly in full, Yearly spread over 12 months. */
function monthlyShare(price: BillPriceAmount): number {
	return price.cadence === 'Yearly' ? price.amount / 12 : price.amount;
}

export function recurringBillsTotalForMonth(
	prices: Array<BillPriceRange & BillPriceAmount>,
	monthKey: string
): number {
	return prices.reduce(
		(acc, price) => (isActiveIn(price, monthKey) ? acc + monthlyShare(price) : acc),
		0
	);
}

type PaymentPeriods = { payments: Array<{ period: string }> };

/** Drop a bill's loaded payments and replace them with whether `monthKey`'s period is paid. */
export function withPaid<R extends PaymentPeriods>(
	row: R,
	cadence: Cadence,
	monthKey: string
): Omit<R, 'payments'> & { paid: boolean } {
	const { payments, ...rest } = row;
	const period = periodKey(cadence, monthKey);
	return { ...rest, paid: payments.some((p) => p.period === period) };
}

/**
 * The bills active in `monthKey`, at that month's amount, cadence and paid state. `history` is
 * `recurringBillQueries.findHistory` output: prices, each with its bill and the bill's payments.
 */
export function recurringBillsForMonth<R extends PaymentPeriods & { merchant: string }>(
	history: Array<BillPriceRange & BillPriceAmount & { recurringBill: R }>,
	monthKey: string
): Array<Omit<R, 'payments'> & BillPriceAmount & { paid: boolean }> {
	return history
		.filter((price) => isActiveIn(price, monthKey))
		.map((price) => ({
			...withPaid(price.recurringBill, price.cadence, monthKey),
			amount: price.amount,
			cadence: price.cadence
		}))
		.toSorted((a, b) => a.merchant.localeCompare(b.merchant));
}
