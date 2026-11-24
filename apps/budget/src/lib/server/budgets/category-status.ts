import { and, eq, sql } from 'drizzle-orm';

import type { CategoryStatus, CategoryStatusState } from '#lib/types.js';
import { getMonthDateRange, padMonth } from '#lib/utils/dates.js';

import { getDb } from '../db';
import { budget, category, expense } from '../db/schema';
import { dateInRange } from '../db/utils';

/** Spent at or above this share of a Budget is `near`. */
const NEAR_BUDGET_RATIO = 0.9;

type BudgetInput = { categoryId: string; categoryName: string; amount: number };
type SpendInput = {
	categoryId: string;
	categoryName: string;
	amount: number;
	excludedFromBudget?: boolean;
};

/** The one Over Budget rule. A Budget of zero or less is never over or near. */
export function classifyCategoryStatus(budgeted: number, spent: number): CategoryStatusState {
	if (budgeted <= 0) return spent > 0 ? 'unbudgeted' : 'empty';
	if (spent > budgeted) return 'over';
	if (spent >= budgeted * NEAR_BUDGET_RATIO) return 'near';
	return 'ok';
}

function toCategoryStatus(
	categoryId: string,
	categoryName: string,
	budgeted: number,
	spent: number
): CategoryStatus {
	const state = classifyCategoryStatus(budgeted, spent);
	return {
		categoryId,
		categoryName,
		budgeted,
		spent,
		overBy: state === 'over' ? spent - budgeted : 0,
		pctUsed: budgeted > 0 ? (spent / budgeted) * 100 : 0,
		state
	};
}

/** Riskiest first: over (largest overBy first), then highest % used, then name. */
function compareRisk(a: CategoryStatus, b: CategoryStatus): number {
	const aOver = a.state === 'over';
	const bOver = b.state === 'over';
	if (aOver !== bOver) return aOver ? -1 : 1;
	if (aOver && a.overBy !== b.overBy) return b.overBy - a.overBy;
	if (a.pctUsed !== b.pctUsed) return b.pctUsed - a.pctUsed;
	return a.categoryName.localeCompare(b.categoryName);
}

/**
 * One status per Category with a Budget or counted spend in the period, riskiest first.
 * Excluded Expenses are dropped here, so callers can pass a month's expenses unfiltered.
 */
export function buildCategoryStatuses(
	budgets: BudgetInput[],
	spend: SpendInput[]
): CategoryStatus[] {
	const rows = new Map<string, { categoryName: string; budgeted: number; spent: number }>();
	const row = (categoryId: string, categoryName: string) => {
		let existing = rows.get(categoryId);
		if (!existing) {
			existing = { categoryName, budgeted: 0, spent: 0 };
			rows.set(categoryId, existing);
		}
		return existing;
	};

	// One Budget per Category per month is enforced by a unique index (#380); summing is only
	// how rows are folded in, not a duplicate rule.
	for (const b of budgets) row(b.categoryId, b.categoryName).budgeted += b.amount;
	for (const s of spend) {
		if (s.excludedFromBudget) continue;
		row(s.categoryId, s.categoryName).spent += s.amount;
	}

	return [...rows.entries()]
		.map(([categoryId, r]) => toCategoryStatus(categoryId, r.categoryName, r.budgeted, r.spent))
		.toSorted(compareRisk);
}

/** Budget/Expense rows as loaded by the query objects (category relation attached). */
type RowWithCategory = { amount: number; category: { id: string; name: string } | null };

export function toBudgetInputs(rows: RowWithCategory[]): BudgetInput[] {
	return rows.flatMap((r) =>
		r.category
			? [{ categoryId: r.category.id, categoryName: r.category.name, amount: r.amount }]
			: []
	);
}

export function toSpendInputs(
	rows: Array<RowWithCategory & { excludedFromBudget: boolean }>
): SpendInput[] {
	return rows.flatMap((r) =>
		r.category
			? [
					{
						categoryId: r.category.id,
						categoryName: r.category.name,
						amount: r.amount,
						excludedFromBudget: r.excludedFromBudget
					}
				]
			: []
	);
}

type PeriodOptions = {
	month: number;
	year: number;
	/** Last day (YYYY-MM-DD) of spend to count; defaults to the month's last day. */
	through?: string;
	categoryId?: string;
};

async function loadPeriod({ month, year, through, categoryId }: PeriodOptions) {
	const { startDate, endDate } = getMonthDateRange(month, year);
	const db = getDb();

	const [budgets, spend] = await Promise.all([
		db
			.select({ categoryId: budget.categoryId, categoryName: category.name, amount: budget.amount })
			.from(budget)
			.innerJoin(category, eq(budget.categoryId, category.id))
			.where(
				and(
					eq(budget.month, padMonth(month)),
					eq(budget.year, year.toString()),
					categoryId ? eq(budget.categoryId, categoryId) : undefined
				)
			),
		db
			.select({
				categoryId: expense.categoryId,
				categoryName: category.name,
				amount: sql<number>`coalesce(sum(${expense.amount}), 0)`
			})
			.from(expense)
			.innerJoin(category, eq(expense.categoryId, category.id))
			.where(
				and(
					eq(expense.excludedFromBudget, false),
					categoryId ? eq(expense.categoryId, categoryId) : undefined,
					...dateInRange(expense.date, startDate, through ?? endDate)
				)
			)
			.groupBy(expense.categoryId, category.name)
	]);

	return buildCategoryStatuses(budgets, spend);
}

/** Every Category with a Budget or counted spend in the month, riskiest first. */
export function getCategoryStatuses(
	options: Omit<PeriodOptions, 'categoryId'>
): Promise<CategoryStatus[]> {
	return loadPeriod(options);
}

/** One Category's status for the month, or null when it has neither a Budget nor spend. */
export async function getCategoryStatus(
	categoryId: string,
	month: number,
	year: number
): Promise<CategoryStatus | null> {
	const [status] = await loadPeriod({ month, year, categoryId });
	return status ?? null;
}
