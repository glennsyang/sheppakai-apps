import { describe, expect, it } from 'vitest';

import { monthProgress, type MonthTotals } from './cash-flow';

// Aug 5, 2026, midday in the app time zone: 5 days elapsed, 27 days left including today, 31 days in month.
const AUG_5 = new Date('2026-08-05T19:00:00Z');

const august: MonthTotals = {
	month: 8,
	year: 2026,
	monthStart: '2026-08-01',
	totalIncome: 5000,
	actualSpent: 1950, // 150 discretionary + 1800 recurring
	recurringBillsMonthlyTotal: 1800,
	plannedExpensesTotal: 4000
};

const noHistory = { baselineExpenses: [], previousMonthsIncome: [] };

describe('monthProgress', () => {
	it('counts today as elapsed and as a day left to spend in', () => {
		const result = monthProgress(august, AUG_5, null);

		expect(result.status).toBe('current');
		expect(result.daysInMonth).toBe(31);
		expect(result.daysElapsed).toBe(5);
		expect(result.daysRemaining).toBe(27);
	});

	it('spreads safe-to-spend and budget left over the days left', () => {
		const result = monthProgress(august, AUG_5, null);

		// 5000 income − 150 discretionary − 1800 recurring
		expect(result.safeToSpend.remaining).toBe(3050);
		expect(result.safeToSpend.perDay).toBeCloseTo(3050 / 27);
		// 4000 planned − 1950 spent
		expect(result.budgetLeftPerDay).toBeCloseTo(2050 / 27);
	});

	it('floors per-day amounts at zero once past income and budget', () => {
		const result = monthProgress(
			{ ...august, totalIncome: 1000, actualSpent: 2100, plannedExpensesTotal: 2000 },
			AUG_5,
			null
		);

		expect(result.safeToSpend.remaining).toBe(1000 - 300 - 1800);
		expect(result.safeToSpend.perDay).toBe(0);
		expect(result.budgetLeftPerDay).toBe(0);
	});

	it('does not smear recurring bills across the forecast daily rate', () => {
		const forecast = monthProgress(august, AUG_5, noHistory).forecast;

		expect(forecast?.dailyRate).toBeCloseTo(30); // 150 / 5, not 1950 / 5
		expect(forecast?.totalEnd).toBeCloseTo(150 + 30 * 26 + 1800);
	});

	it('has one day left on the last day of the month', () => {
		const result = monthProgress(august, new Date('2026-08-31T19:00:00Z'), noHistory);

		expect(result.daysRemaining).toBe(1);
		expect(result.safeToSpend.perDay).toBe(3050);
		expect(result.forecast?.totalEnd).toBeCloseTo(1950);
	});

	it('uses the app-time-zone day, not UTC', () => {
		// 03:00 UTC on Aug 6 is still Aug 5 in the app time zone.
		const result = monthProgress(august, new Date('2026-08-06T03:00:00Z'), null);

		expect(result.daysElapsed).toBe(5);
	});

	it('has no days left and no forecast for a past month', () => {
		const result = monthProgress(
			{ ...august, month: 6, monthStart: '2026-06-01' },
			AUG_5,
			noHistory
		);

		expect(result.status).toBe('past');
		expect(result.daysElapsed).toBe(30);
		expect(result.daysRemaining).toBe(0);
		expect(result.safeToSpend.perDay).toBe(3050);
		expect(result.forecast).toBeNull();
	});

	it('has every day left and no forecast for a future month', () => {
		const result = monthProgress(
			{ ...august, month: 12, monthStart: '2026-12-01', actualSpent: 0 },
			AUG_5,
			noHistory
		);

		expect(result.status).toBe('future');
		expect(result.daysElapsed).toBe(0);
		expect(result.daysRemaining).toBe(31);
		expect(result.forecast).toBeNull();
	});

	it('has no forecast for the current month without history', () => {
		expect(monthProgress(august, AUG_5, null).forecast).toBeNull();
	});
});
