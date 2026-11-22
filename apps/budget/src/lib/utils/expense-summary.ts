import type { Expense } from '#lib/types.js';

export type ExpenseSummary = {
	monthlyTotal: number;
	yearlyTotal: number;
	monthlyAverage: number | null;
};

export function calculateExpenseSummary(
	monthlyExpenses: Expense[],
	yearlyExpenses: Expense[],
	completedMonths: number
): ExpenseSummary {
	const monthlyTotal = monthlyExpenses
		.filter((t) => !t.excludedFromBudget)
		.reduce((sum, t) => sum + t.amount, 0);

	const filteredYearly = yearlyExpenses.filter((t) => !t.excludedFromBudget);
	const yearlyTotal = filteredYearly.reduce((sum, t) => sum + t.amount, 0);

	const monthlyAverage =
		completedMonths > 0 && filteredYearly.length > 0 ? yearlyTotal / completedMonths : null;

	return { monthlyTotal, yearlyTotal, monthlyAverage };
}
