import { describe, expect, it } from 'vitest';

import {
	currentMonthKey,
	isActiveIn,
	periodKey,
	previousMonthKey,
	recurringTotalForMonth,
	toMonthKey
} from './recurring-history';

describe('month keys', () => {
	it('pads the month', () => {
		expect(toMonthKey(3, 2026)).toBe('2026-03');
	});

	it('steps back across a year boundary', () => {
		expect(previousMonthKey('2027-01')).toBe('2026-12');
		expect(previousMonthKey('2026-11')).toBe('2026-10');
	});

	it('uses Pacific time for the current month', () => {
		// 2026-12-01 03:00 UTC is still November 30 in Pacific time
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

	it('treats an open version as active from its start on', () => {
		expect(isActiveIn({ effectiveFrom: '2026-02', effectiveTo: null }, '2030-01')).toBe(true);
	});
});

describe('recurringTotalForMonth', () => {
	it('counts monthly bills in full and spreads yearly bills over 12 months', () => {
		const versions = [
			{ amount: 80, cadence: 'Monthly' as const, effectiveFrom: '2026-01', effectiveTo: null },
			{ amount: 120, cadence: 'Yearly' as const, effectiveFrom: '2026-01', effectiveTo: null },
			{ amount: 50, cadence: 'Monthly' as const, effectiveFrom: '2025-01', effectiveTo: '2025-12' }
		];

		expect(recurringTotalForMonth(versions, '2026-03')).toBe(90);
		expect(recurringTotalForMonth(versions, '2025-06')).toBe(50);
	});
});
