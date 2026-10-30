import { describe, expect, it } from 'vitest';

import { customerRates, medianGapDays, recleanDue, revenueByMonth } from './windowCleaningStats';

const job = (
	jobDate: string,
	amountCharged = 100,
	tip = 0,
	durationHours: number | null = null
) => ({
	jobDate,
	amountCharged,
	tip,
	durationHours
});

describe('medianGapDays', () => {
	it('returns null with fewer than two distinct dates', () => {
		expect(medianGapDays([])).toBeNull();
		expect(medianGapDays(['2026-01-01 10:00:00'])).toBeNull();
		expect(medianGapDays(['2026-01-01 10:00:00', '2026-01-01 15:00:00'])).toBeNull();
	});

	it('uses the middle gap for an odd count of gaps, ignoring input order and time of day', () => {
		// gaps: 30, 90, 31
		expect(
			medianGapDays([
				'2026-05-01 09:00:00',
				'2026-01-01 18:00:00',
				'2026-01-31 08:00:00',
				'2026-06-01 12:00:00'
			])
		).toBe(31);
	});

	it('averages the two middle gaps for an even count of gaps', () => {
		// gaps: 10, 20
		expect(medianGapDays(['2026-01-01', '2026-01-11', '2026-01-31'])).toBe(15);
	});

	it('handles gaps across a leap day', () => {
		expect(medianGapDays(['2028-02-28', '2028-03-01'])).toBe(2);
	});
});

describe('recleanDue', () => {
	const dates = ['2025-01-01 10:00:00', '2025-04-01 10:00:00', '2025-07-01 10:00:00'];

	it('returns null with no jobs', () => {
		expect(recleanDue([], 30, '2026-01-01')).toBeNull();
	});

	it('returns null with one job and no override', () => {
		expect(recleanDue(['2025-01-01 10:00:00'], null, '2026-01-01')).toBeNull();
	});

	it('uses the median gap from the last job', () => {
		// gaps 90, 91 → 91 (rounded 90.5); last 2025-07-01 + 91 = 2025-09-30
		expect(recleanDue(dates, null, '2025-10-10')).toEqual({
			intervalDays: 91,
			dueDate: '2025-09-30',
			overdueDays: 10
		});
	});

	it('prefers the override and reports days left as negative', () => {
		expect(recleanDue(['2025-07-01 10:00:00'], 365, '2026-06-21')).toEqual({
			intervalDays: 365,
			dueDate: '2026-07-01',
			overdueDays: -10
		});
	});
});

describe('customerRates', () => {
	it('returns nulls with no jobs', () => {
		expect(customerRates([])).toEqual({ hourlyRate: null, tipPct: null, hoursLogged: 0 });
	});

	it('only counts timed jobs toward $/hour but all jobs toward tip %', () => {
		const rates = customerRates([
			job('2026-01-01', 100, 20, 2),
			job('2026-02-01', 200, 0, null),
			job('2026-03-01', 100, 10, 1)
		]);
		// timed: (120 + 110) / 3h; tips 30 / charged 400
		expect(rates.hourlyRate).toBeCloseTo(76.67, 2);
		expect(rates.tipPct).toBeCloseTo(0.075);
		expect(rates.hoursLogged).toBe(3);
	});

	it('returns a null rate when no job logged hours', () => {
		expect(customerRates([job('2026-01-01', 100, 5)]).hourlyRate).toBeNull();
	});
});

describe('revenueByMonth', () => {
	it('returns 12 months of charged + tip for the given year only', () => {
		const rows = revenueByMonth(
			[
				job('2026-01-15 10:00:00', 100, 10),
				job('2026-01-20 10:00:00', 50),
				job('2026-12-01 10:00:00', 80),
				job('2025-01-15 10:00:00', 999)
			],
			2026
		);
		expect(rows).toHaveLength(12);
		expect(rows[0]).toEqual({ month: 'January', earned: 160 });
		expect(rows[11]).toEqual({ month: 'December', earned: 80 });
		expect(rows[5].earned).toBe(0);
	});
});
