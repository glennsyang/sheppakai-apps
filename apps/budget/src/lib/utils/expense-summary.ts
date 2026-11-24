import type { Expense } from '#lib/types.js';

export type ExpenseSummary = {
	monthlyTotal: number;
	yearlyTotal: number;
};

const countedTotal = (expenses: Expense[]) =>
	expenses.filter((t) => !t.excludedFromBudget).reduce((sum, t) => sum + t.amount, 0);

/** Month and year totals, not counting Excluded Expenses. The monthly average is server-side. */
export function calculateExpenseSummary(
	monthlyExpenses: Expense[],
	yearlyExpenses: Expense[]
): ExpenseSummary {
	return { monthlyTotal: countedTotal(monthlyExpenses), yearlyTotal: countedTotal(yearlyExpenses) };
}
