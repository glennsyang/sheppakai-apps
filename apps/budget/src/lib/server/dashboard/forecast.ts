// Month-end cash-flow forecast and savings goal ETAs for the dashboard. Pure functions only:
// `summary.ts` does the querying and passes rows in.
import type { ForecastRange, MonthEndForecast, SavingsGoalStatus } from '#lib/types.js';

const DAY_MS = 86_400_000;
const AVG_DAYS_PER_MONTH = 30.44;

/** Weeks of history before the month that the baseline spending rate is drawn from. */
const BASELINE_WEEKS = 13;
/** Below this many weeks of history, the forecast uses this month's pace alone and has no band. */
const MIN_BASELINE_WEEKS = 4;
/** Months of contributions a goal's monthly rate is averaged over. */
const GOAL_RATE_MONTHS = 6;

type DatedAmount = { date: string; amount: number };

function toDayNumber(date: string): number {
	const [year, month, day] = date.slice(0, 10).split('-').map(Number);
	return Date.UTC(year, month - 1, day) / DAY_MS;
}

function fromDayNumber(dayNumber: number): string {
	return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
	return fromDayNumber(toDayNumber(date) + days);
}

/** Inclusive date range of the BASELINE_WEEKS × 7 days before `monthStart`. */
export function getBaselineRange(monthStart: string): { startDate: string; endDate: string } {
	return {
		startDate: addDays(monthStart, -BASELINE_WEEKS * 7),
		endDate: addDays(monthStart, -1)
	};
}

/** Start date (YYYY-MM-DD) of the window a goal's monthly contribution rate is averaged over. */
export function getGoalRateWindowStart(today: string): string {
	return addDays(today, -Math.round(GOAL_RATE_MONTHS * AVG_DAYS_PER_MONTH));
}

/**
 * Weekly spending totals for the baseline window, oldest first. Weeks before the first
 * transaction are dropped so a new account isn't averaged against empty history.
 */
export function weeklyTotals(rows: DatedAmount[], monthStart: string): number[] {
	const windowStart = toDayNumber(monthStart) - BASELINE_WEEKS * 7;
	const totals = Array.from({ length: BASELINE_WEEKS }, () => 0);
	let firstWeek = BASELINE_WEEKS;

	for (const row of rows) {
		const week = Math.floor((toDayNumber(row.date) - windowStart) / 7);
		if (week < 0 || week >= BASELINE_WEEKS) continue;
		totals[week] += row.amount;
		firstWeek = Math.min(firstWeek, week);
	}

	return totals.slice(firstWeek);
}

/** Linear-interpolated percentile of an ascending-sorted list (p in 0..1). */
function percentile(sorted: number[], p: number): number {
	const index = (sorted.length - 1) * p;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function average(values: number[]): number {
	return values.length > 0 ? values.reduce((acc, v) => acc + v, 0) / values.length : 0;
}

export interface MonthEndForecastInput {
	/** Included-in-budget transactions from `getBaselineRange(monthStart)`. */
	baselineTransactions: DatedAmount[];
	monthStart: string;
	daysInMonth: number;
	/** Current day of the month (1-based); today counts as elapsed. */
	currentDay: number;
	/** Discretionary (non-recurring) spend so far this month. */
	discretionarySpent: number;
	recurringMonthlyTotal: number;
	incomeThisMonth: number;
	/** Income totals for each of the previous full months. */
	previousMonthsIncome: number[];
}

/**
 * Projects month-end spend and net position. The daily rate blends this month's pace with the
 * baseline, weighted by how far through the month we are, so day 2 isn't driven by one purchase.
 * The band uses the baseline's 25th/75th percentile weeks.
 */
export function computeMonthEndForecast({
	baselineTransactions,
	monthStart,
	daysInMonth,
	currentDay,
	discretionarySpent,
	recurringMonthlyTotal,
	incomeThisMonth,
	previousMonthsIncome
}: MonthEndForecastInput): MonthEndForecast {
	const day = Math.min(Math.max(currentDay, 1), daysInMonth);
	const daysRemaining = daysInMonth - day;
	const thisMonthRate = discretionarySpent / day;
	const weeks = weeklyTotals(baselineTransactions, monthStart);

	let rate = { low: thisMonthRate, mid: thisMonthRate, high: thisMonthRate };
	if (weeks.length >= MIN_BASELINE_WEEKS) {
		const weight = day / daysInMonth;
		const mid = weight * thisMonthRate + (1 - weight) * (average(weeks) / 7);
		const sorted = [...weeks].sort((a, b) => a - b);
		rate = {
			low: Math.min(percentile(sorted, 0.25) / 7, mid),
			mid,
			high: Math.max(percentile(sorted, 0.75) / 7, mid)
		};
	}

	const discretionaryEnd: ForecastRange = {
		low: discretionarySpent + rate.low * daysRemaining,
		mid: discretionarySpent + rate.mid * daysRemaining,
		high: discretionarySpent + rate.high * daysRemaining
	};
	const totalEnd = discretionaryEnd.mid + recurringMonthlyTotal;
	const expectedIncome = Math.max(incomeThisMonth, average(previousMonthsIncome));

	return {
		dailyRate: rate.mid,
		discretionaryEnd,
		totalEnd,
		expectedIncome,
		net: {
			low: expectedIncome - discretionaryEnd.high - recurringMonthlyTotal,
			mid: expectedIncome - totalEnd,
			high: expectedIncome - discretionaryEnd.low - recurringMonthlyTotal
		},
		baselineWeeks: weeks.length
	};
}

export interface GoalEtaInput {
	status: SavingsGoalStatus;
	currentAmount: number;
	targetAmount: number;
	targetDate: string | null;
	/** Sum of this goal's contributions since `getGoalRateWindowStart(today)`. */
	recentContributions: number;
	firstContributionDate: string | null;
	today: string;
}

export interface GoalEta {
	monthlyRate: number;
	etaDate: string | null;
	onTrack: boolean | null;
}

/**
 * Projected finish date from the average monthly contribution over the last GOAL_RATE_MONTHS
 * (or since the first contribution, if newer). Only active, unfinished goals get an ETA.
 */
export function computeGoalEta({
	status,
	currentAmount,
	targetAmount,
	targetDate,
	recentContributions,
	firstContributionDate,
	today
}: GoalEtaInput): GoalEta {
	let monthlyRate = 0;
	if (firstContributionDate) {
		const monthsSinceFirst =
			(toDayNumber(today) - toDayNumber(firstContributionDate)) / AVG_DAYS_PER_MONTH;
		monthlyRate = recentContributions / Math.min(Math.max(monthsSinceFirst, 1), GOAL_RATE_MONTHS);
	}

	if (status !== 'active' || currentAmount >= targetAmount) {
		return { monthlyRate, etaDate: null, onTrack: null };
	}

	const target = targetDate ? targetDate.slice(0, 10) : null;
	if (monthlyRate <= 0) {
		return { monthlyRate: 0, etaDate: null, onTrack: target ? false : null };
	}

	const monthsNeeded = (targetAmount - currentAmount) / monthlyRate;
	const etaDate = addDays(today, Math.ceil(monthsNeeded * AVG_DAYS_PER_MONTH));
	return { monthlyRate, etaDate, onTrack: target ? etaDate <= target : null };
}
