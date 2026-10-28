import { describe, expect, it } from 'vitest';

import {
	computeGoalEta,
	computeMonthEndForecast,
	getBaselineRange,
	getGoalRateWindowStart,
	weeklyTotals,
	type GoalEtaInput,
	type MonthEndForecastInput
} from './forecast';

/** One transaction per day for the whole 91-day baseline window before `monthStart`. */
function dailyBaseline(monthStart: string, amountForWeek: (week: number) => number) {
	const { startDate } = getBaselineRange(monthStart);
	const start = Date.parse(`${startDate}T00:00:00Z`);
	return Array.from({ length: 91 }, (_, i) => ({
		date: new Date(start + i * 86_400_000).toISOString().slice(0, 10) + ' 12:00:00',
		amount: amountForWeek(Math.floor(i / 7)) / 7
	}));
}

const baseInput: MonthEndForecastInput = {
	baselineTransactions: dailyBaseline('2026-10-01', () => 700), // $100/day
	monthStart: '2026-10-01',
	daysInMonth: 31,
	currentDay: 10,
	discretionarySpent: 2000, // $200/day so far
	recurringMonthlyTotal: 500,
	incomeThisMonth: 6000,
	previousMonthsIncome: [5000, 5000, 5000]
};

describe('getBaselineRange', () => {
	it('covers the 91 days before the month', () => {
		expect(getBaselineRange('2026-10-01')).toEqual({
			startDate: '2026-07-02',
			endDate: '2026-09-30'
		});
	});
});

describe('getGoalRateWindowStart', () => {
	it('goes back about six months', () => {
		expect(getGoalRateWindowStart('2026-10-27')).toBe('2026-04-27');
	});
});

describe('weeklyTotals', () => {
	it('buckets rows into 13 weeks and ignores rows outside the window', () => {
		const rows = [
			{ date: '2026-07-02 09:00:00', amount: 10 }, // week 0
			{ date: '2026-07-09', amount: 20 }, // week 1
			{ date: '2026-09-30', amount: 30 }, // week 12
			{ date: '2026-07-01', amount: 999 }, // before the window
			{ date: '2026-10-01', amount: 999 } // in the month itself
		];
		const totals = weeklyTotals(rows, '2026-10-01');
		expect(totals).toHaveLength(13);
		expect(totals[0]).toBe(10);
		expect(totals[1]).toBe(20);
		expect(totals[12]).toBe(30);
	});

	it('drops weeks before the first transaction', () => {
		expect(weeklyTotals([{ date: '2026-09-20', amount: 50 }], '2026-10-01')).toEqual([50, 0]);
	});
});

describe('computeMonthEndForecast', () => {
	it('blends this month and the baseline by how far through the month we are', () => {
		const forecast = computeMonthEndForecast(baseInput);
		// w = 10/31: 10/31 × 200 + 21/31 × 100
		const expectedRate = (10 / 31) * 200 + (21 / 31) * 100;
		expect(forecast.dailyRate).toBeCloseTo(expectedRate);
		expect(forecast.discretionaryEnd.mid).toBeCloseTo(2000 + expectedRate * 21);
		expect(forecast.totalEnd).toBeCloseTo(forecast.discretionaryEnd.mid + 500);
		expect(forecast.baselineWeeks).toBe(13);
	});

	it('leans on the baseline on day 1 and on actuals on the last day', () => {
		const dayOne = computeMonthEndForecast({
			...baseInput,
			currentDay: 1,
			discretionarySpent: 1000
		});
		expect(dayOne.dailyRate).toBeCloseTo((1 / 31) * 1000 + (30 / 31) * 100);

		const lastDay = computeMonthEndForecast({ ...baseInput, currentDay: 31 });
		expect(lastDay.discretionaryEnd).toEqual({ low: 2000, mid: 2000, high: 2000 });
	});

	it('orders the band low ≤ mid ≤ high from the baseline quartiles', () => {
		const forecast = computeMonthEndForecast({
			...baseInput,
			baselineTransactions: dailyBaseline('2026-10-01', (week) => 350 + week * 100)
		});
		const { low, mid, high } = forecast.discretionaryEnd;
		expect(low).toBeLessThan(mid);
		expect(mid).toBeLessThan(high);
		expect(forecast.net.low).toBeLessThan(forecast.net.mid);
		expect(forecast.net.mid).toBeLessThan(forecast.net.high);
	});

	it("falls back to this month's pace with no band when history is short", () => {
		const forecast = computeMonthEndForecast({
			...baseInput,
			baselineTransactions: [{ date: '2026-09-25', amount: 300 }]
		});
		expect(forecast.baselineWeeks).toBe(1);
		expect(forecast.dailyRate).toBe(200);
		expect(forecast.discretionaryEnd).toEqual({ low: 6200, mid: 6200, high: 6200 });
	});

	it('uses the larger of recorded income and the previous 3-month average', () => {
		expect(computeMonthEndForecast(baseInput).expectedIncome).toBe(6000);
		expect(computeMonthEndForecast({ ...baseInput, incomeThisMonth: 0 }).expectedIncome).toBe(5000);
		expect(
			computeMonthEndForecast({ ...baseInput, incomeThisMonth: 0, previousMonthsIncome: [] })
				.expectedIncome
		).toBe(0);
	});

	it.each([28, 30, 31])('projects to the end of a %i-day month', (daysInMonth) => {
		const forecast = computeMonthEndForecast({
			...baseInput,
			baselineTransactions: [],
			daysInMonth,
			currentDay: 14,
			discretionarySpent: 1400
		});
		expect(forecast.discretionaryEnd.mid).toBeCloseTo(100 * daysInMonth);
	});
});

describe('computeGoalEta', () => {
	const goal: GoalEtaInput = {
		status: 'active',
		currentAmount: 1000,
		targetAmount: 4000,
		targetDate: null,
		recentContributions: 3000, // $500/month over 6 months
		firstContributionDate: '2025-01-01 08:00:00',
		today: '2026-10-27'
	};

	it('projects a finish date from the 6-month average', () => {
		const eta = computeGoalEta(goal);
		expect(eta.monthlyRate).toBe(500);
		// 6 months to go
		expect(eta.etaDate).toBe('2027-04-28');
		expect(eta.onTrack).toBeNull();
	});

	it('averages over the months since the first contribution when newer than 6 months', () => {
		const eta = computeGoalEta({
			...goal,
			recentContributions: 1000,
			firstContributionDate: '2026-08-27'
		});
		expect(eta.monthlyRate).toBeCloseTo(1000 / (61 / 30.44));
	});

	it('reports on/behind target against the target date', () => {
		expect(computeGoalEta({ ...goal, targetDate: '2027-12-31 08:00:00' }).onTrack).toBe(true);
		expect(computeGoalEta({ ...goal, targetDate: '2027-01-01 08:00:00' }).onTrack).toBe(false);
	});

	it('has no ETA without recent contributions, and is behind if a target date is set', () => {
		expect(computeGoalEta({ ...goal, recentContributions: 0 })).toEqual({
			monthlyRate: 0,
			etaDate: null,
			onTrack: null
		});
		expect(
			computeGoalEta({ ...goal, recentContributions: 0, targetDate: '2027-01-01' }).onTrack
		).toBe(false);
		expect(computeGoalEta({ ...goal, firstContributionDate: null }).etaDate).toBeNull();
	});

	it('skips completed, paused and fully funded goals', () => {
		expect(computeGoalEta({ ...goal, status: 'paused' }).etaDate).toBeNull();
		expect(computeGoalEta({ ...goal, status: 'completed' }).etaDate).toBeNull();
		expect(computeGoalEta({ ...goal, currentAmount: 4000 }).etaDate).toBeNull();
	});
});
