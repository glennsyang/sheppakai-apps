import { describe, expect, it } from 'vitest';

import { currentWeek } from '../../lib/server/week';

describe('currentWeek', () => {
	it.each([
		['Monday', new Date(2026, 10, 23, 9), '2026-11-23'],
		['Wednesday', new Date(2026, 10, 25, 18), '2026-11-23'],
		['Sunday', new Date(2026, 10, 29, 23, 59), '2026-11-23'],
		['across a month boundary', new Date(2026, 9, 1), '2026-09-28'],
		['across a year boundary', new Date(2027, 0, 2), '2026-12-28']
	])('returns the Monday for a %s', (_, today, monday) => {
		expect(currentWeek(today)).toBe(monday);
	});

	it('keeps local midnight on its own day instead of shifting to UTC', () => {
		// Monday 00:00 local is still Sunday in UTC for any zone east of UTC; the week must
		// still start on this Monday, not the one before.
		expect(currentWeek(new Date(2026, 10, 23, 0, 0, 0))).toBe('2026-11-23');
		// Sunday 23:59:59 local is Monday in UTC for any zone west of UTC; still last week.
		expect(currentWeek(new Date(2026, 10, 22, 23, 59, 59))).toBe('2026-11-16');
	});

	it('defaults to now', () => {
		const result = currentWeek();
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		const [y, m, d] = result.split('-').map(Number);
		expect(new Date(y, m - 1, d).getDay()).toBe(1);
	});
});
