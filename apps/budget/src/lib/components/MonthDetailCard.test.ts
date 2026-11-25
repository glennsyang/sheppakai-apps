import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

import type { CashFlow, MonthEndForecast } from '#lib/types.js';

import MonthDetailCard from './MonthDetailCard.svelte';

const forecast: MonthEndForecast = {
	dailyRate: 40,
	discretionaryEnd: { low: 1100, mid: 1200, high: 1300 },
	totalEnd: 2400,
	expectedIncome: 3000,
	net: { low: 500, mid: 600, high: 700 },
	baselineWeeks: 13
};

const cashFlow: CashFlow = {
	status: 'current',
	daysInMonth: 30,
	daysElapsed: 10,
	daysRemaining: 21,
	safeToSpend: { remaining: 2000, perDay: 2000 / 21 },
	budgetLeftPerDay: 20,
	forecast
};
const currentMonth = { cashFlow };

describe('MonthDetailCard', () => {
	it('renders net balance in the on-track (positive) state', () => {
		const html = render(MonthDetailCard, {
			props: {
				actualSpent: 800,
				plannedBudget: 1200,
				totalIncome: 3000,
				...currentMonth
			}
		}).body;

		// Net balance = 3000 - 800 = +2200
		expect(html).toContain('$2,200.00');
		expect(html).toContain('On track this month');
		expect(html).not.toContain('Overspent this month');
	});

	it('renders overspent state when actual spent exceeds income', () => {
		const html = render(MonthDetailCard, {
			props: {
				actualSpent: 3500,
				plannedBudget: 4000,
				totalIncome: 3000,
				...currentMonth
			}
		}).body;

		// Net balance = 3000 - 3500 = -500
		expect(html).toContain('$500.00');
		expect(html).toContain('Overspent this month');
		expect(html).not.toContain('On track this month');
	});

	it('renders skeleton placeholders in loading state', () => {
		const html = render(MonthDetailCard, {
			props: {
				actualSpent: 500,
				plannedBudget: 1000,
				totalIncome: 2000,
				loading: true,
				...currentMonth
			}
		}).body;

		expect(html).toContain('animate-pulse');
		// Should NOT render the actual dollar amounts while loading
		expect(html).not.toContain('On track this month');
		expect(html).not.toContain('Overspent this month');
	});

	it('shows zero net balance when income equals actual spent', () => {
		const html = render(MonthDetailCard, {
			props: {
				actualSpent: 2000,
				plannedBudget: 2500,
				totalIncome: 2000,
				...currentMonth
			}
		}).body;

		expect(html).toContain('$0.00');
	});

	it('renders the server forecast for the current month', () => {
		const html = render(MonthDetailCard, {
			props: { actualSpent: 800, plannedBudget: 1200, totalIncome: 3000, cashFlow }
		}).body;

		expect(html).toContain('$2,400.00'); // month-end
		expect(html).toContain('$600.00'); // month-end net
		expect(html).toContain('$40.00'); // spending /day
		expect(html).toContain('$20.00'); // budget left /day
	});

	it('hides the projection without a forecast', () => {
		const html = render(MonthDetailCard, {
			props: {
				actualSpent: 800,
				plannedBudget: 1200,
				totalIncome: 3000,
				cashFlow: { ...cashFlow, status: 'past', forecast: null }
			}
		}).body;

		expect(html).not.toContain('Month-end net');
		expect(html).toContain('Stayed on track');
	});
});
