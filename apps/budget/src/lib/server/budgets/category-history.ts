import type { Budget } from '#lib/types.js';
import { padMonth } from '#lib/utils/dates.js';

/**
 * Category History: what a Category spent and was budgeted in the months before a given
 * month. Owns the one definition of Monthly Average (see GLOSSARY.md) and the Preset
 * amounts built on it.
 */

export type MonthEntry = { month: string; year: string; date: Date };
type MonthKey = { month: string; year: string };

export type PresetType = 'lastMonth' | 'lastMonthBudget' | 'average' | 'custom';

export type PresetAmounts = {
	lastMonthSpent: number;
	lastMonthBudget: number;
	averageSpent: number;
};

type CategoryMonthTotal = { categoryId: string; month: string; year: string; total: number };

/** Preset amounts look back over this many full months before the selected month. */
export const PRESET_WINDOW_MONTHS = 12;

const roundToCents = (n: number) => Math.round(n * 100) / 100;
const keyOf = ({ month, year }: MonthKey) => `${year}-${month}`;

/**
 * `count` months ending at (and including) `month`/`year`, oldest first. Dates sit at noon
 * UTC so they stay on the right calendar day once serialized to a Pacific browser.
 */
export function monthWindow(month: number, year: number, count: number): MonthEntry[] {
	const months: MonthEntry[] = [];
	for (let i = count - 1; i >= 0; i--) {
		const date = new Date(Date.UTC(year, month - 1 - i, 1, 12, 0, 0));
		months.push({
			month: padMonth(String(date.getUTCMonth() + 1)),
			year: String(date.getUTCFullYear()),
			date
		});
	}
	return months;
}

export function previousMonth(month: number, year: number): MonthKey {
	const { month: m, year: y } = monthWindow(month, year, 2)[0];
	return { month: m, year: y };
}

/**
 * The one Monthly Average. Takes one counted-spend total per full month, oldest first.
 * Months before the first month with spend are dropped, so a new Category isn't diluted;
 * empty months after that count as zero. Rounded to cents; 0 when nothing was spent.
 */
export function monthlyAverage(monthTotals: number[]): number {
	const first = monthTotals.findIndex((total) => total !== 0);
	if (first === -1) return 0;
	const counted = monthTotals.slice(first);
	return roundToCents(counted.reduce((sum, total) => sum + total, 0) / counted.length);
}

/** Number of months from the first month with spend to the end of the window. */
export function monthsWithHistory(monthTotals: number[]): number {
	const first = monthTotals.findIndex((total) => total !== 0);
	return first === -1 ? 0 : monthTotals.length - first;
}

/**
 * Preset amounts per Category for the selected month: last month's spend and Budget, and
 * the Monthly Average over the full months before it. The selected month never counts.
 * `expenseTotals` must already leave out Excluded Expenses.
 */
export function buildCategoryHistory({
	month,
	year,
	expenseTotals,
	budgets,
	windowMonths = PRESET_WINDOW_MONTHS
}: {
	month: number;
	year: number;
	expenseTotals: CategoryMonthTotal[];
	budgets: Budget[];
	windowMonths?: number;
}): Map<string, PresetAmounts> {
	const window = monthWindow(month, year, windowMonths + 1).slice(0, -1);
	const lastMonthKey = keyOf(window[window.length - 1]);
	const windowKeys = new Set(window.map(keyOf));

	const spentByCategory = new Map<string, Map<string, number>>();
	for (const row of expenseTotals) {
		const key = keyOf(row);
		if (!windowKeys.has(key)) continue;
		const months = spentByCategory.get(row.categoryId) ?? new Map<string, number>();
		months.set(key, (months.get(key) ?? 0) + row.total);
		spentByCategory.set(row.categoryId, months);
	}

	const lastBudgetByCategory = new Map<string, number>();
	for (const b of budgets) {
		const categoryId = b.category?.id ?? b.categoryId;
		if (keyOf({ month: padMonth(b.month), year: b.year }) === lastMonthKey) {
			lastBudgetByCategory.set(categoryId, b.amount);
		}
	}

	const history = new Map<string, PresetAmounts>();
	for (const categoryId of new Set([...spentByCategory.keys(), ...lastBudgetByCategory.keys()])) {
		const months = spentByCategory.get(categoryId);
		history.set(categoryId, {
			lastMonthSpent: months?.get(lastMonthKey) ?? 0,
			lastMonthBudget: lastBudgetByCategory.get(categoryId) ?? 0,
			averageSpent: monthlyAverage(window.map((m) => months?.get(keyOf(m)) ?? 0))
		});
	}
	return history;
}

/**
 * Which Preset a Budget used. A stored `presetType` wins; a legacy Budget without one is
 * matched against the Preset amounts, falling back to custom. No Budget → null.
 */
export function suggestPreset(
	budget: Pick<Budget, 'amount' | 'presetType'> | undefined,
	amounts: PresetAmounts
): PresetType | null {
	if (!budget) return null;
	if (budget.presetType) return budget.presetType as PresetType;

	const { amount } = budget;
	if (amount === amounts.lastMonthSpent && amounts.lastMonthSpent > 0) return 'lastMonth';
	if (amount === amounts.lastMonthBudget && amounts.lastMonthBudget > 0) return 'lastMonthBudget';
	if (amount === amounts.averageSpent && amounts.averageSpent > 0) return 'average';
	if (amount > 0) return 'custom';
	return null;
}

/**
 * Monthly Average of dated amounts (Expenses or Income) over the completed months of `year`
 * (January up to `completedMonths`). Rows in the current or later months, and Excluded
 * Expenses, don't count. Null when no month has completed or nothing was recorded.
 */
export function completedMonthsAverage(
	expenses: Array<{ date: string; amount: number; excludedFromBudget?: boolean | null }>,
	year: number,
	completedMonths: number
): number | null {
	if (completedMonths <= 0) return null;
	const totals = Array.from({ length: completedMonths }, () => 0);
	for (const e of expenses) {
		if (e.excludedFromBudget) continue;
		if (Number(e.date.substring(0, 4)) !== year) continue;
		const monthIndex = Number(e.date.substring(5, 7)) - 1;
		if (monthIndex < 0 || monthIndex >= completedMonths) continue;
		totals[monthIndex] += e.amount;
	}
	return monthsWithHistory(totals) === 0 ? null : monthlyAverage(totals);
}
