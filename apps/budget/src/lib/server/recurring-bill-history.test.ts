import { describe, expect, it } from 'vitest';

import {
	currentMonthKey,
	isActiveIn,
	nextMonthKey,
	periodKey,
	previousMonthKey,
	recurringBillsTotalForMonth,
	toMonthKey,
	upcomingBills
} from './recurring-bill-history';

describe('month keys', () => {
	it('pads the month', () => {
		expect(toMonthKey(3, 2026)).toBe('2026-03');
	});

	it('steps back across a year boundary', () => {
		expect(previousMonthKey('2027-01')).toBe('2026-12');
		expect(previousMonthKey('2026-11')).toBe('2026-10');
		expect(nextMonthKey('2026-12')).toBe('2027-01');
		expect(nextMonthKey('2026-09')).toBe('2026-10');
	});

	it('uses the app time zone for the current month', () => {
		// 2026-12-01 03:00 UTC is still November 30 in the app time zone
		expect(currentMonthKey(new Date('2026-12-01T03:00:00Z'))).toBe('2026-11');
	});

	it('keys yearly payments by year and monthly payments by month', () => {
		expect(periodKey('Yearly', '2026-07')).toBe('2026');
		expect(periodKey('Monthly', '2026-07')).toBe('2026-07');
	});
});

describe('isActiveIn', () => {
	const closed = { effectiveFrom: '2026-02', effectiveTo: '2026-04' };

	it('includes both ends of the range', () => {
		expect(isActiveIn(closed, '2026-02')).toBe(true);
		expect(isActiveIn(closed, '2026-04')).toBe(true);
		expect(isActiveIn(closed, '2026-01')).toBe(false);
		expect(isActiveIn(closed, '2026-05')).toBe(false);
	});

	it('treats an open price as active from its start on', () => {
		expect(isActiveIn({ effectiveFrom: '2026-02', effectiveTo: null }, '2030-01')).toBe(true);
	});
});

describe('recurringBillsTotalForMonth', () => {
	it('counts monthly bills in full and spreads yearly bills over 12 months', () => {
		const prices = [
			{ amount: 80, cadence: 'Monthly' as const, effectiveFrom: '2026-01', effectiveTo: null },
			{ amount: 120, cadence: 'Yearly' as const, effectiveFrom: '2026-01', effectiveTo: null },
			{ amount: 50, cadence: 'Monthly' as const, effectiveFrom: '2025-01', effectiveTo: '2025-12' }
		];

		expect(recurringBillsTotalForMonth(prices, '2026-03')).toBe(90);
		expect(recurringBillsTotalForMonth(prices, '2025-06')).toBe(50);
	});
});

describe('upcomingBills', () => {
	type Bill = {
		id: string;
		paid: boolean;
		dueDay: number | null;
		dueMonth: number | null;
		cadence: 'Monthly' | 'Yearly';
	};
	const monthly = (dueDay: number | null, paid = false): Bill => ({
		id: `m${dueDay}`,
		paid,
		dueDay,
		dueMonth: null,
		cadence: 'Monthly'
	});
	const yearly = (dueMonth: number | null, dueDay: number, paid = false): Bill => ({
		id: `y${dueMonth}-${dueDay}`,
		paid,
		dueDay,
		dueMonth,
		cadence: 'Yearly'
	});
	const only = (bill: Bill, monthKey: string, today: string) =>
		upcomingBills([bill], monthKey, today).map(({ dueDate, daysUntilDue, overdue }) => ({
			dueDate,
			daysUntilDue,
			overdue
		}));

	describe.each([
		['Monthly', monthly(15), '2026-03'],
		['Yearly', yearly(3, 15), '2026-01']
	] as const)('%s Recurring Bill due 2026-03-15', (_cadence, bill, monthKey) => {
		const viewed = bill.cadence === 'Yearly' ? monthKey : '2026-03';

		it('is upcoming before the due date', () => {
			expect(only(bill, viewed, '2026-03-06')).toEqual([
				{ dueDate: '2026-03-15', daysUntilDue: 9, overdue: false }
			]);
		});

		it('is due today on the due date', () => {
			expect(only(bill, viewed, '2026-03-15')).toEqual([
				{ dueDate: '2026-03-15', daysUntilDue: 0, overdue: false }
			]);
		});

		it('is an Overdue Bill after the due date', () => {
			expect(only(bill, viewed, '2026-03-20')).toEqual([
				{ dueDate: '2026-03-15', daysUntilDue: -5, overdue: true }
			]);
		});

		it('is left out once paid', () => {
			expect(only({ ...bill, paid: true }, viewed, '2026-03-20')).toEqual([]);
		});
	});

	it('leaves out bills due more than 14 days ahead', () => {
		expect(only(monthly(24), '2026-03', '2026-03-10')).toEqual([
			{ dueDate: '2026-03-24', daysUntilDue: 14, overdue: false }
		]);
		expect(only(monthly(25), '2026-03', '2026-03-10')).toEqual([]);
	});

	it('leaves out bills with no due day', () => {
		expect(only(monthly(null), '2026-03', '2026-03-10')).toEqual([]);
	});

	it('clamps the due day to the end of a short month', () => {
		expect(only(monthly(31), '2026-02', '2026-02-20')[0].dueDate).toBe('2026-02-28');
		expect(only(monthly(31), '2024-02', '2024-02-20')[0].dueDate).toBe('2024-02-29');
	});

	it('uses the viewed month for a Yearly bill without a due month', () => {
		expect(only(yearly(null, 15), '2026-05', '2026-05-10')[0].dueDate).toBe('2026-05-15');
	});

	it('counts days across a month boundary', () => {
		expect(only(yearly(4, 2), '2026-03', '2026-03-30')[0].daysUntilDue).toBe(3);
	});

	it('sorts soonest first, Overdue Bills on top', () => {
		const bills = [monthly(20), monthly(5), monthly(12)];
		expect(upcomingBills(bills, '2026-03', '2026-03-10').map((u) => u.bill.id)).toEqual([
			'm5',
			'm12',
			'm20'
		]);
	});
});
