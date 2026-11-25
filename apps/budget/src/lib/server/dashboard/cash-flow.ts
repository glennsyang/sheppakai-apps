// The dashboard's cash flow for one month: safe-to-spend, budget left per day and the month-end
// forecast. Computed once on the server with `today` passed in, so the page and
// `GET /api/v1/dashboard` agree on what day it is.
import { computeMonthEndForecast } from '#lib/server/dashboard/forecast.js';
import type { CashFlow } from '#lib/types.js';
import { getMonthProgress } from '#lib/utils/dates.js';

export interface MonthTotals {
	month: number;
	year: number;
	/** First day of the month (YYYY-MM-DD). */
	monthStart: string;
	totalIncome: number;
	/** Total spent, recurring bills included. */
	actualSpent: number;
	recurringBillsMonthlyTotal: number;
	/** Category budgets plus recurring bills. */
	plannedExpensesTotal: number;
}

/** History behind the month-end forecast; only loaded for the current month. */
export interface ForecastHistory {
	baselineExpenses: { date: string; amount: number }[];
	previousMonthsIncome: number[];
}

export function monthProgress(
	totals: MonthTotals,
	today: Date,
	history: ForecastHistory | null
): CashFlow {
	const period = getMonthProgress(totals.month, totals.year, today);
	const daysInMonth = period.totalUnits;
	const daysElapsed = period.elapsedUnits;
	// Today counts as a day left to spend in.
	const daysRemaining =
		period.status === 'current' ? daysInMonth - daysElapsed + 1 : daysInMonth - daysElapsed;
	const perDayDivisor = Math.max(daysRemaining, 1);

	const discretionarySpent = Math.max(0, totals.actualSpent - totals.recurringBillsMonthlyTotal);
	const remaining = totals.totalIncome - discretionarySpent - totals.recurringBillsMonthlyTotal;
	const budgetLeft = Math.max(0, totals.plannedExpensesTotal - totals.actualSpent);

	const forecast =
		period.status === 'current' && history
			? computeMonthEndForecast({
					...history,
					monthStart: totals.monthStart,
					daysInMonth,
					currentDay: daysElapsed,
					discretionarySpent,
					recurringBillsMonthlyTotal: totals.recurringBillsMonthlyTotal,
					incomeThisMonth: totals.totalIncome
				})
			: null;

	return {
		status: period.status,
		daysInMonth,
		daysElapsed,
		daysRemaining,
		safeToSpend: { remaining, perDay: Math.max(remaining, 0) / perDayDivisor },
		budgetLeftPerDay: budgetLeft / perDayDivisor,
		forecast
	};
}
