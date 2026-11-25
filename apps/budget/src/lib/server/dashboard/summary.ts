import type {
	Budget,
	CategoryStatus,
	ExcludedExpense,
	ExcludedSpendCategory,
	MonthEndForecast,
	MonthlySpentChartData,
	SpendingSpike,
	TimeRangeInOutData,
	Expense
} from '#lib';
import {
	buildCategoryStatuses,
	toBudgetInputs,
	toSpendInputs
} from '#lib/server/budgets/category-status.js';
import { computeMonthEndForecast, getBaselineRange } from '#lib/server/dashboard/forecast.js';
import {
	budgetQueries,
	incomeQueries,
	recurringBillQueries,
	savingsAccountQueries,
	expenseQueries
} from '#lib/server/db/queries/index.js';
import { computeSpendingSpikes } from '#lib/server/insights/spending-spikes.js';
import {
	recurringBillsForMonth,
	recurringBillsTotalForMonth,
	toMonthKey,
	upcomingBills
} from '#lib/server/recurring-bill-history.js';
import { goalsWithProgress as loadGoalsWithProgress } from '#lib/server/savings/goals.js';
import { monthNames } from '#lib/utils.js';
import {
	filterByDateRange,
	getCalendarYearMonthsRange,
	getMonthDateRange,
	getMonthProgress,
	getMonthRangeFromUrl,
	getPacificTodayDate,
	getPreviousMonthsRange,
	getYearDateRange,
	parseYearParam
} from '#lib/utils/dates.js';

function groupExcludedByCategory(excludedExpenses: Expense[]): ExcludedSpendCategory[] {
	const totals = new Map<string, ExcludedSpendCategory>();

	for (const expense of excludedExpenses) {
		const categoryId = expense.category?.id ?? null;
		const categoryName = expense.category?.name ?? 'Uncategorized';
		const key = categoryId ?? '__uncategorized__';
		const existing = totals.get(key);
		if (existing) {
			existing.amount += expense.amount;
		} else {
			totals.set(key, { categoryId, categoryName, amount: expense.amount });
		}
	}

	return [...totals.values()].sort((a, b) => b.amount - a.amount);
}

/** Lean, newest-first rows for the yearly "Not counted" sheet. */
function toExcludedExpenseRows(excludedExpenses: Expense[]): ExcludedExpense[] {
	return excludedExpenses
		.map((e) => ({
			id: e.id,
			date: e.date,
			payee: e.payee,
			notes: e.notes,
			amount: e.amount,
			categoryName: e.category?.name ?? 'Uncategorized'
		}))
		.toSorted((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Current-month forecast inputs that `loadMonthlyDashboard` doesn't already load. */
async function loadForecastHistory(startDate: string, month: number, year: number) {
	const baseline = getBaselineRange(startDate);
	const previousMonths = [3, 2, 1].map((back) => {
		const d = new Date(year, month - 1 - back, 1);
		return getMonthDateRange(d.getMonth() + 1, d.getFullYear());
	});

	const [baselineExpenses, previousIncome] = await Promise.all([
		expenseQueries.findByDateRangeIncludedInBudget(baseline.startDate, baseline.endDate),
		incomeQueries.findByDateRange(previousMonths[0].startDate, previousMonths[2].endDate)
	]);

	const previousMonthsIncome = previousMonths.map((range) =>
		filterByDateRange(previousIncome, range.startDate, range.endDate).reduce(
			(acc, inc) => acc + inc.amount,
			0
		)
	);

	return { baselineExpenses, previousMonthsIncome };
}

export async function loadMonthlyDashboard(url: URL) {
	const { month, year, startDate, endDate } = getMonthRangeFromUrl(url);
	const monthProgress = getMonthProgress(month, year);
	const isCurrentMonth = monthProgress.status === 'current';
	const selectedMonthKey = toMonthKey(month, year);
	const chartStartDate = new Date(year, month - 6, 1);
	const chartStartKey = toMonthKey(chartStartDate.getMonth() + 1, chartStartDate.getFullYear());

	const [
		actualExpenses,
		excludedExpenses,
		plannedExpenses,
		billPriceHistory,
		incomeRecords,
		goalsWithProgress,
		savingsAccountsTotal,
		forecastHistory
	] = await Promise.all([
		expenseQueries.findByDateRangeIncludedInBudget(startDate, endDate),
		expenseQueries.findByDateRangeExcludedFromBudget(startDate, endDate),
		budgetQueries.findByMonthYear(month, year),
		// Prices in effect over the 6-month chart window, so each month uses its own amounts.
		recurringBillQueries.findHistory(chartStartKey, selectedMonthKey),
		incomeQueries.findByDateRange(startDate, endDate),
		loadGoalsWithProgress(),
		savingsAccountQueries.getTotal(),
		isCurrentMonth ? loadForecastHistory(startDate, month, year) : null
	]);

	const recurringBills = recurringBillsForMonth(billPriceHistory, selectedMonthKey);
	const recurringBillsMonthlyTotal = recurringBillsTotalForMonth(
		billPriceHistory,
		selectedMonthKey
	);
	const excludedExpensesTotal = excludedExpenses.reduce((acc, e) => acc + e.amount, 0);
	const excludedExpensesBreakdown = groupExcludedByCategory(excludedExpenses);
	const actualExpensesTotal =
		actualExpenses.reduce((acc, e) => acc + e.amount, 0) + recurringBillsMonthlyTotal;
	const plannedExpensesTotal =
		plannedExpenses.reduce((acc, b) => acc + b.amount, 0) + recurringBillsMonthlyTotal;
	const totalIncome = incomeRecords.reduce((acc, inc) => acc + inc.amount, 0);
	const remainingBalance = totalIncome - plannedExpensesTotal;
	const categoryStatuses = buildCategoryStatuses(
		toBudgetInputs(plannedExpenses),
		toSpendInputs(actualExpenses)
	);

	const forecast: MonthEndForecast | null = forecastHistory
		? computeMonthEndForecast({
				...forecastHistory,
				monthStart: startDate,
				daysInMonth: monthProgress.totalUnits,
				currentDay: monthProgress.elapsedUnits,
				discretionarySpent: actualExpensesTotal - recurringBillsMonthlyTotal,
				recurringBillsMonthlyTotal,
				incomeThisMonth: totalIncome
			})
		: null;

	const historicalMonths: Array<{
		targetMonth: number;
		targetYear: number;
		monthStart: string;
		monthEnd: string;
	}> = [];
	let chartEnd = '';

	for (let i = 5; i >= 0; i--) {
		const targetDate = new Date(year, month - 1 - i, 1);
		if (targetDate > new Date()) continue;

		const targetMonth = targetDate.getMonth() + 1;
		const targetYear = targetDate.getFullYear();
		const { startDate: monthStart, endDate: monthEnd } = getMonthDateRange(targetMonth, targetYear);
		historicalMonths.push({ targetMonth, targetYear, monthStart, monthEnd });
		chartEnd = monthEnd;
	}

	const monthlyInOutData: TimeRangeInOutData[] = [];
	let spendingSpikes: SpendingSpike[] = [];

	if (historicalMonths.length > 0) {
		const chartStart = historicalMonths[0].monthStart;

		const [allChartTx, allChartIncome] = await Promise.all([
			expenseQueries.findByDateRangeIncludedInBudget(chartStart, chartEnd),
			incomeQueries.findByDateRange(chartStart, chartEnd)
		]);

		for (const { targetMonth, targetYear, monthStart, monthEnd } of historicalMonths) {
			const monthTx = allChartTx.filter(
				(t) => t.date.substring(0, 10) >= monthStart && t.date.substring(0, 10) <= monthEnd
			);
			const monthInc = allChartIncome.filter(
				(inc) => inc.date.substring(0, 10) >= monthStart && inc.date.substring(0, 10) <= monthEnd
			);

			monthlyInOutData.push({
				month: monthNames[targetMonth - 1],
				in: monthInc.reduce((acc, inc) => acc + inc.amount, 0),
				out:
					monthTx.reduce((acc, t) => acc + t.amount, 0) +
					recurringBillsTotalForMonth(billPriceHistory, toMonthKey(targetMonth, targetYear))
			});
		}

		spendingSpikes = computeSpendingSpikes(allChartTx, historicalMonths, plannedExpenses);
	}

	const netflowSparkline = monthlyInOutData.map((d) => ({ month: d.month, value: d.in - d.out }));
	const spendingSparkline = monthlyInOutData.map((d) => ({ month: d.month, value: d.out }));

	return {
		mode: 'monthly' as const,
		month,
		year,
		actualExpenses,
		plannedExpenses,
		categoryStatuses,
		recurringBills,
		upcomingBills: upcomingBills(recurringBills, selectedMonthKey, getPacificTodayDate()),
		recurringBillsMonthlyTotal,
		actualExpensesTotal,
		excludedExpensesTotal,
		excludedExpensesBreakdown,
		plannedExpensesTotal,
		totalIncome,
		remainingBalance,
		monthlyInOutData,
		netflowSparkline,
		spendingSparkline,
		spendingSpikes,
		forecast,
		goalsWithProgress,
		savingsAccountsTotal
	};
}

/**
 * Per-Category chart series for the yearly view: every chart month for every Category that has a
 * Budget or spend in any of them. Over Budget comes from Category Status, not the chart.
 */
function toCategoryMonthly(
	statusesByMonth: Array<{ month: string; statuses: Map<string, CategoryStatus> }>
): Record<string, MonthlySpentChartData[]> {
	const categoryIds = new Set(statusesByMonth.flatMap(({ statuses }) => [...statuses.keys()]));
	const series: Record<string, MonthlySpentChartData[]> = {};
	for (const categoryId of categoryIds) {
		series[categoryId] = statusesByMonth.map(({ month, statuses }) => {
			const status = statuses.get(categoryId);
			return {
				month,
				spent: status?.spent ?? 0,
				budget: status && status.budgeted > 0 ? status.budgeted : undefined,
				overbudget: status?.overBy ?? 0
			};
		});
	}
	return series;
}

export async function loadYearlyDashboard(url: URL) {
	const currentYear = new Date().getFullYear();
	const view = url.searchParams.get('view') === 'full' ? 'full' : 'current';
	const year = parseYearParam(url.searchParams.get('year'), currentYear);
	const { startDate, endDate } = getYearDateRange(year);
	const monthRanges =
		view === 'current' && year === currentYear
			? getPreviousMonthsRange(6)
			: getCalendarYearMonthsRange(year);
	const historyStartKey = [
		toMonthKey(1, year),
		...monthRanges.map((r) => toMonthKey(r.month, r.year))
	].toSorted()[0];
	// `view=current` in January–May reaches back into the prior year; fetch those budgets too.
	const otherChartYears = [...new Set(monthRanges.map((r) => r.year))].filter((y) => y !== year);

	const [
		actualExpenses,
		excludedExpenses,
		incomeRecords,
		billPriceHistory,
		allYearBudgets,
		otherYearBudgets,
		goalsWithProgress,
		savingsAccountsTotal
	] = await Promise.all([
		expenseQueries.findByDateRangeIncludedInBudget(startDate, endDate),
		expenseQueries.findByDateRangeExcludedFromBudget(startDate, endDate),
		incomeQueries.findByDateRange(startDate, endDate),
		recurringBillQueries.findHistory(historyStartKey, toMonthKey(12, year)),
		budgetQueries.findByYear(year),
		Promise.all(otherChartYears.map((y) => budgetQueries.findByYear(y))),
		loadGoalsWithProgress(),
		savingsAccountQueries.getTotal()
	]);
	const chartBudgets: Budget[] = [...allYearBudgets, ...otherYearBudgets.flat()];

	const yearlyBudgets: Array<{ categoryId: string; amount: number }> = [];
	allYearBudgets.forEach((b) => {
		const existing = yearlyBudgets.find((e) => e.categoryId === b.category?.id);
		if (existing) {
			existing.amount += b.amount;
		} else if (b.category) {
			yearlyBudgets.push({ categoryId: b.category.id, amount: b.amount });
		}
	});

	const elapsedMonths = year === currentYear ? new Date().getMonth() + 1 : 12;
	// Each elapsed month counts the prices in effect that month (Yearly bills as amount / 12).
	let recurringBillsYearlyTotal = 0;
	for (let m = 1; m <= elapsedMonths; m++) {
		recurringBillsYearlyTotal += recurringBillsTotalForMonth(billPriceHistory, toMonthKey(m, year));
	}
	const excludedExpensesTotal = excludedExpenses.reduce((acc, e) => acc + e.amount, 0);
	const excludedExpensesBreakdown = groupExcludedByCategory(excludedExpenses);
	const actualExpensesTotal =
		actualExpenses.reduce((acc, e) => acc + e.amount, 0) + recurringBillsYearlyTotal;
	const plannedExpensesTotal =
		yearlyBudgets.reduce((acc, b) => acc + b.amount, 0) + recurringBillsYearlyTotal;
	const totalIncome = incomeRecords.reduce((acc, inc) => acc + inc.amount, 0);
	const remainingBalance = totalIncome - plannedExpensesTotal;

	const timeRangeData: TimeRangeInOutData[] = [];
	const statusesByMonth: Array<{ month: string; statuses: Map<string, CategoryStatus> }> = [];

	if (monthRanges.length > 0) {
		const chartStart = monthRanges[0].startDate;
		const chartEnd = monthRanges[monthRanges.length - 1].endDate;

		const [allChartTx, allChartIncome] = await Promise.all([
			expenseQueries.findByDateRangeIncludedInBudget(chartStart, chartEnd),
			incomeQueries.findByDateRange(chartStart, chartEnd)
		]);

		for (const range of monthRanges) {
			const monthTx = allChartTx.filter(
				(t) =>
					t.date.substring(0, 10) >= range.startDate && t.date.substring(0, 10) <= range.endDate
			);
			const monthInc = allChartIncome.filter(
				(inc) =>
					inc.date.substring(0, 10) >= range.startDate && inc.date.substring(0, 10) <= range.endDate
			);

			const monthRecurringBills = recurringBillsTotalForMonth(
				billPriceHistory,
				toMonthKey(range.month, range.year)
			);
			const monthBudgets = chartBudgets.filter(
				(b) => Number(b.month) === range.month && Number(b.year) === range.year
			);
			// Same definition as the monthly view's planned budget: category budgets + recurring.
			const monthBudgeted = monthBudgets.reduce((acc, b) => acc + b.amount, 0);
			const monthStatuses = buildCategoryStatuses(
				toBudgetInputs(monthBudgets),
				toSpendInputs(monthTx)
			);
			statusesByMonth.push({
				month: monthNames[range.month - 1],
				statuses: new Map(monthStatuses.map((st) => [st.categoryId, st]))
			});

			timeRangeData.push({
				month: monthNames[range.month - 1],
				in: monthInc.reduce((acc, inc) => acc + inc.amount, 0),
				out: monthTx.reduce((acc, t) => acc + t.amount, 0) + monthRecurringBills,
				budgeted: monthBudgeted + monthRecurringBills
			});
		}
	}

	return {
		mode: 'yearly' as const,
		categoryMonthly: toCategoryMonthly(statusesByMonth),
		view,
		year,
		actualExpenses,
		yearlyBudgets,
		allYearBudgets,
		actualExpensesTotal,
		excludedExpensesTotal,
		excludedExpensesBreakdown,
		excludedExpenses: toExcludedExpenseRows(excludedExpenses),
		plannedExpensesTotal,
		totalIncome,
		remainingBalance,
		timeRangeData,
		goalsWithProgress,
		savingsAccountsTotal
	};
}

/** Shared by the dashboard page load and `GET /api/v1/dashboard` so both read the same numbers. */
export async function getDashboardSummary(url: URL) {
	const mode = url.searchParams.get('mode') === 'yearly' ? 'yearly' : 'monthly';
	return mode === 'yearly' ? loadYearlyDashboard(url) : loadMonthlyDashboard(url);
}
