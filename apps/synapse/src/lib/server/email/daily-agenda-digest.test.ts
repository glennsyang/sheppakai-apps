import { describe, expect, it } from 'vitest';

import {
	DAILY_MOTIVATION_PHRASES,
	getDailyMotivationPhrase,
	isWithinDailyDigestWindow
} from './daily-agenda-digest';

describe('daily-agenda-digest', () => {
	it('uses deterministic daily motivation phrase selection by date', () => {
		const phraseA = getDailyMotivationPhrase('2026-03-16');
		const phraseB = getDailyMotivationPhrase('2026-03-16');

		expect(phraseA).toEqual(phraseB);
		expect(DAILY_MOTIVATION_PHRASES).toContain(phraseA);
	});

	it('fires any time after 6:00 AM PT so delayed cron runs can still send', () => {
		expect(isWithinDailyDigestWindow('06', '00')).toBe(true);
		expect(isWithinDailyDigestWindow('06', '10')).toBe(true);
		expect(isWithinDailyDigestWindow('06', '21')).toBe(true);
		expect(isWithinDailyDigestWindow('14', '30')).toBe(true);
		expect(isWithinDailyDigestWindow('23', '59')).toBe(true);
		expect(isWithinDailyDigestWindow('05', '59')).toBe(false);
	});
});
