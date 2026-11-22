import { describe, expect, it } from 'vitest';

import type { Expense } from '../types';
import { calculateExpenseSummary } from './expense-summary';

const t = (amount: number, excludedFromBudget = false) =>
	({ amount, excludedFromBudget }) as unknown as Expense;

describe('calculateExpenseSummary', () => {
	describe('monthlyTotal', () => {
		it('sums only non-excluded expenses', () => {
			const monthly = [t(100), t(200), t(50, true)];
			const { monthlyTotal } = calculateExpenseSummary(monthly, [], 5);
			expect(monthlyTotal).toBe(300);
		});

		it('returns 0 when all expenses are excluded from budget', () => {
			const monthly = [t(100, true), t(200, true)];
			const { monthlyTotal } = calculateExpenseSummary(monthly, [], 5);
			expect(monthlyTotal).toBe(0);
		});
	});

	describe('yearlyTotal', () => {
		it('sums only non-excluded yearly expenses', () => {
			const yearly = [t(400), t(600), t(100, true)];
			const { yearlyTotal } = calculateExpenseSummary([], yearly, 5);
			expect(yearlyTotal).toBe(1000);
		});
	});

	describe('monthlyAverage', () => {
		it('divides yearlyTotal by completedMonths', () => {
			const yearly = [t(500), t(500)];
			const { monthlyAverage } = calculateExpenseSummary([], yearly, 5);
			expect(monthlyAverage).toBe(200);
		});

		it('returns null when completedMonths is 0', () => {
			const yearly = [t(1000)];
			const { monthlyAverage } = calculateExpenseSummary([], yearly, 0);
			expect(monthlyAverage).toBeNull();
		});

		it('returns null when yearly expenses array is empty', () => {
			const { monthlyAverage } = calculateExpenseSummary([], [], 5);
			expect(monthlyAverage).toBeNull();
		});
	});
});
