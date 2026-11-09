import { inArray, min, sql, sum } from 'drizzle-orm';

import type {
	CategoryAnomaly,
	ExcludedSpendCategory,
	MonthEndForecast,
	SavingsGoalWithEta,
	TimeRangeInOutData,
	Transaction
} from '#lib';
import {
	computeGoalEta,
	computeMonthEndForecast,
	getBaselineRange,
	getGoalRateWindowStart
} from '#lib/server/dashboard/forecast.js';
import { getDb } from '#lib/server/db/index.js';
import {
	budgetQueries,
	incomeQueries,
	recurringQueries,
	savingsGoalQueries,
	savingsQueries,
	transactionQueries
} from '#lib/server/db/queries/index.js';
import { contribution } from '#lib/server/db/schema/index.js';
import { computeCategoryAnomalies } from '#lib/server/insights/category-anomalies.js';
import {
	recurringForMonth,
	recurringTotalForMonth,
	toMonthKey
} from '#lib/server/recurring-history.js';
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

function groupExcludedByCategory(excludedExpenses: Transaction[]): ExcludedSpendCategory[] {
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

async function getGoalsWithProgress(): Promise<SavingsGoalWithEta[]> {
	const goals = await savingsGoalQueries.findAll();
	const includedGoals = goals.filter((g) => g.status !== 'archived');

	if (includedGoals.length === 0) return [];

	const includedGoalIds = includedGoals.map((g) => g.id);
	const today = getPacificTodayDate();
	const rateWindowStart = getGoalRateWindowStart(today);

	const totalsRows = await getDb()
		.select({
			goalId: contribution.goalId,
			total: sum(contribution.amount),
			recentTotal: sql<number>`coalesce(sum(case when date(${contribution.date}) >= date(${rateWindowStart}) then ${contribution.amount} else 0 end), 0)`,
			firstDate: min(contribution.date)
		})
		.from(contribution)
		.where(inArray(contribution.goalId, includedGoalIds))
		.groupBy(contribution.goalId);

	const totalsMap = new Map(totalsRows.map((r) => [r.goalId, r]));

	return includedGoals.map((goal) => {
		const row = totalsMap.get(goal.id);
		const total = Number(row?.total ?? 0);
		const percentage = goal.targetAmount > 0 ? (total / goal.targetAmount) * 100 : 0;
		const eta = computeGoalEta({
			status: goal.status,
			currentAmount: total,
			targetAmount: goal.targetAmount,
			targetDate: goal.targetDate,
			recentContributions: Number(row?.recentTotal ?? 0),
			firstContributionDate: row?.firstDate ?? null,
			today
		});
		return { ...goal, currentAmount: total, percentage: Math.min(percentage, 100), ...eta };
	});
}

/** Current-month forecast inputs that `loadMonthlyDashboard` doesn't already load. */
async function loadForecastHistory(startDate: string, month: number, year: number) {
	const baseline = getBaselineRange(startDate);
	const previousMonths = [3, 2, 1].map((back) => {
		const d = new Date(year, month - 1 - back, 1);
		return getMonthDateRange(d.getMonth() + 1, d.getFullYear());
	});

	const [baselineTransactions, previousIncome] = await Promise.all([
		transactionQueries.findByDateRangeIncludedInBudget(baseline.startDate, baseline.endDate),
		incomeQueries.findByDateRange(previousMonths[0].startDate, previousMonths[2].endDate)
	]);

	const previousMonthsIncome = previousMonths.map((range) =>
		filterByDateRange(previousIncome, range.startDate, range.endDate).reduce(
			(acc, inc) => acc + inc.amount,
			0
		)
	);

	return { baselineTransactions, previousMonthsIncome };
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
		recurringHistory,
		incomeRecords,
		goalsWithProgress,
		totalSavings,
		forecastHistory
	] = await Promise.all([
		transactionQueries.findByDateRangeIncludedInBudget(startDate, endDate),
		transactionQueries.findByDateRangeExcludedFromBudget(startDate, endDate),
		budgetQueries.findByMonthYear(month, year),
		// Versions in effect over the 6-month chart window, so each month uses its own amounts.
		recurringQueries.findHistory(chartStartKey, selectedMonthKey),
		incomeQueries.findByDateRange(startDate, endDate),
		getGoalsWithProgress(),
		savingsQueries.getTotal(),
		isCurrentMonth ? loadForecastHistory(startDate, month, year) : null
	]);

	const recurringExpenses = recurringForMonth(recurringHistory, selectedMonthKey);
	const recurringMonthlyTotal = recurringTotalForMonth(recurringHistory, selectedMonthKey);
	const excludedExpensesTotal = excludedExpenses.reduce((acc, e) => acc + e.amount, 0);
	const excludedExpensesBreakdown = groupExcludedByCategory(excludedExpenses);
	const actualExpensesTotal =
		actualExpenses.reduce((acc, e) => acc + e.amount, 0) + recurringMonthlyTotal;
	const plannedExpensesTotal =
		plannedExpenses.reduce((acc, b) => acc + b.amount, 0) + recurringMonthlyTotal;
	const totalIncome = incomeRecords.reduce((acc, inc) => acc + inc.amount, 0);
	const remainingBalance = totalIncome - plannedExpensesTotal;

	const forecast: MonthEndForecast | null = forecastHistory
		? computeMonthEndForecast({
				...forecastHistory,
				monthStart: startDate,
				daysInMonth: monthProgress.totalUnits,
				currentDay: monthProgress.elapsedUnits,
				discretionarySpent: actualExpensesTotal - recurringMonthlyTotal,
				recurringMonthlyTotal,
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
	let categoryAnomalies: CategoryAnomaly[] = [];

	if (historicalMonths.length > 0) {
		const chartStart = historicalMonths[0].monthStart;

		const [allChartTx, allChartIncome] = await Promise.all([
			transactionQueries.findByDateRangeIncludedInBudget(chartStart, chartEnd),
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
					recurringTotalForMonth(recurringHistory, toMonthKey(targetMonth, targetYear))
			});
		}

		categoryAnomalies = computeCategoryAnomalies(allChartTx, historicalMonths, plannedExpenses);
	}

	const netflowSparkline = monthlyInOutData.map((d) => ({ month: d.month, value: d.in - d.out }));
	const spendingSparkline = monthlyInOutData.map((d) => ({ month: d.month, value: d.out }));

	return {
		mode: 'monthly' as const,
		month,
		year,
		actualExpenses,
		plannedExpenses,
		recurringExpenses,
		recurringMonthlyTotal,
		actualExpensesTotal,
		excludedExpensesTotal,
		excludedExpensesBreakdown,
		plannedExpensesTotal,
		totalIncome,
		remainingBalance,
		monthlyInOutData,
		netflowSparkline,
		spendingSparkline,
		categoryAnomalies,
		forecast,
		goalsWithProgress,
		totalSavings
	};
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

	const [
		actualExpenses,
		excludedExpenses,
		incomeRecords,
		recurringHistory,
		allYearBudgets,
		goalsWithProgress,
		totalSavings
	] = await Promise.all([
		transactionQueries.findByDateRangeIncludedInBudget(startDate, endDate),
		transactionQueries.findByDateRangeExcludedFromBudget(startDate, endDate),
		incomeQueries.findByDateRange(startDate, endDate),
		recurringQueries.findHistory(historyStartKey, toMonthKey(12, year)),
		budgetQueries.findByYear(year),
		getGoalsWithProgress(),
		savingsQueries.getTotal()
	]);

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
	// Each elapsed month counts the versions in effect that month (Yearly bills as amount / 12).
	let recurringYearlyTotal = 0;
	for (let m = 1; m <= elapsedMonths; m++) {
		recurringYearlyTotal += recurringTotalForMonth(recurringHistory, toMonthKey(m, year));
	}
	const excludedExpensesTotal = excludedExpenses.reduce((acc, e) => acc + e.amount, 0);
	const excludedExpensesBreakdown = groupExcludedByCategory(excludedExpenses);
	const actualExpensesTotal =
		actualExpenses.reduce((acc, e) => acc + e.amount, 0) + recurringYearlyTotal;
	const plannedExpensesTotal =
		yearlyBudgets.reduce((acc, b) => acc + b.amount, 0) + recurringYearlyTotal;
	const totalIncome = incomeRecords.reduce((acc, inc) => acc + inc.amount, 0);
	const remainingBalance = totalIncome - plannedExpensesTotal;

	const timeRangeData: TimeRangeInOutData[] = [];

	if (monthRanges.length > 0) {
		const chartStart = monthRanges[0].startDate;
		const chartEnd = monthRanges[monthRanges.length - 1].endDate;

		const [allChartTx, allChartIncome] = await Promise.all([
			transactionQueries.findByDateRangeIncludedInBudget(chartStart, chartEnd),
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

			timeRangeData.push({
				month: monthNames[range.month - 1],
				in: monthInc.reduce((acc, inc) => acc + inc.amount, 0),
				out:
					monthTx.reduce((acc, t) => acc + t.amount, 0) +
					recurringTotalForMonth(recurringHistory, toMonthKey(range.month, range.year))
			});
		}
	}

	return {
		mode: 'yearly' as const,
		view,
		year,
		actualExpenses,
		yearlyBudgets,
		allYearBudgets,
		actualExpensesTotal,
		excludedExpensesTotal,
		excludedExpensesBreakdown,
		plannedExpensesTotal,
		totalIncome,
		remainingBalance,
		timeRangeData,
		goalsWithProgress,
		totalSavings
	};
}

/** Shared by the dashboard page load and `GET /api/v1/dashboard` so both read the same numbers. */
export async function getDashboardSummary(url: URL) {
	const mode = url.searchParams.get('mode') === 'yearly' ? 'yearly' : 'monthly';
	return mode === 'yearly' ? loadYearlyDashboard(url) : loadMonthlyDashboard(url);
}
