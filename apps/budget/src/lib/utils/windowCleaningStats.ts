/**
 * Pure stats for the window-cleaning pages: re-clean intervals, $/hour, tips and monthly
 * revenue. No DB access, so the load functions stay thin and the maths stays testable.
 *
 * Job dates are stored as local timestamps (`YYYY-MM-DD HH:MM:SS`); only the date part
 * counts here.
 */

type StatsJob = {
	jobDate: string;
	amountCharged: number;
	tip: number;
	durationHours: number | null;
};

export type RecleanDue = {
	intervalDays: number;
	/** `YYYY-MM-DD` */
	dueDate: string;
	/** Positive when overdue, negative when the due date is still ahead. */
	overdueDays: number;
};

export type CustomerRates = {
	/** (charged + tip) per hour over the jobs that logged a duration; null when none did. */
	hourlyRate: number | null;
	/** Tips as a fraction of the amount charged; null when nothing was charged. */
	tipPct: number | null;
	hoursLogged: number;
};

const DAY_MS = 86_400_000;

function toDayNumber(date: string): number {
	return Math.round(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

function fromDayNumber(day: number): string {
	return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Median gap in days between distinct job dates; null with fewer than two dates. */
export function medianGapDays(jobDates: string[]): number | null {
	const days = [...new Set(jobDates.map(toDayNumber))].toSorted((a, b) => a - b);
	if (days.length < 2) return null;

	const gaps = days.slice(1).map((day, i) => day - days[i]);
	const sorted = gaps.toSorted((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
	return Math.round(median);
}

/**
 * When a customer is next due. The interval is the customer's own override when set,
 * otherwise the median gap between their jobs. Null when there is no last job or no
 * interval to go on.
 */
export function recleanDue(
	jobDates: string[],
	intervalOverride: number | null | undefined,
	today: string
): RecleanDue | null {
	if (jobDates.length === 0) return null;

	const intervalDays = intervalOverride ?? medianGapDays(jobDates);
	if (!intervalDays) return null;

	const lastDay = Math.max(...jobDates.map(toDayNumber));
	const dueDay = lastDay + intervalDays;
	return {
		intervalDays,
		dueDate: fromDayNumber(dueDay),
		overdueDays: toDayNumber(today) - dueDay
	};
}

export function customerRates(jobs: StatsJob[]): CustomerRates {
	let timedEarned = 0;
	let hoursLogged = 0;
	let charged = 0;
	let tips = 0;

	for (const job of jobs) {
		charged += job.amountCharged;
		tips += job.tip;
		if (job.durationHours != null && job.durationHours > 0) {
			hoursLogged += job.durationHours;
			timedEarned += job.amountCharged + job.tip;
		}
	}

	return {
		hourlyRate: hoursLogged > 0 ? timedEarned / hoursLogged : null,
		tipPct: charged > 0 ? tips / charged : null,
		hoursLogged
	};
}

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** Earned (charged + tip) per calendar month of `year`, always 12 rows. */
export function revenueByMonth(
	jobs: StatsJob[],
	year: number
): { month: string; earned: number }[] {
	const totals = Array.from({ length: 12 }, () => 0);
	const prefix = `${year}-`;
	for (const job of jobs) {
		if (!job.jobDate.startsWith(prefix)) continue;
		const monthIndex = Number(job.jobDate.slice(5, 7)) - 1;
		totals[monthIndex] += job.amountCharged + job.tip;
	}
	return MONTHS.map((month, i) => ({ month, earned: totals[i] }));
}
