import { describe, expect, it } from 'vitest';

import {
	buildScheduledVisitReminderEntityIdForPerson,
	buildScheduledVisitReminderSubject,
	buildVisitTodayReminderEntityIdForPerson,
	buildVisitTodayReminderSubject,
	formatReminderDate,
	getDateDaysAhead
} from './scheduled-visit-reminder-utils';

describe('getDateDaysAhead', () => {
	it('returns the correct date when adding positive days', () => {
		expect(getDateDaysAhead(new Date('2026-01-01T20:00:00Z'), 7)).toBe('2026-01-08');
		expect(getDateDaysAhead(new Date('2026-03-25T20:00:00Z'), 10)).toBe('2026-04-04');
	});

	it('handles month-boundary rollover correctly', () => {
		expect(getDateDaysAhead(new Date('2026-01-28T20:00:00Z'), 7)).toBe('2026-02-04');
	});

	it('handles year-boundary rollover correctly', () => {
		expect(getDateDaysAhead(new Date('2025-12-28T20:00:00Z'), 7)).toBe('2026-01-04');
	});

	it('returns the same date when days is 0', () => {
		expect(getDateDaysAhead(new Date('2026-06-15T20:00:00Z'), 0)).toBe('2026-06-15');
	});

	it('counts from the Pacific date on evening runs when UTC is already tomorrow', () => {
		// 2026-01-10T03:00Z is Jan 9, 7pm PST
		expect(getDateDaysAhead(new Date('2026-01-10T03:00:00Z'), 7)).toBe('2026-01-16');
	});

	it('counts from the Pacific date on evening runs during daylight time', () => {
		// 2026-07-10T05:37Z is Jul 9, 10:37pm PDT
		expect(getDateDaysAhead(new Date('2026-07-10T05:37:00Z'), 7)).toBe('2026-07-16');
	});

	it('handles the DST spring-forward week', () => {
		expect(getDateDaysAhead(new Date('2026-03-07T20:00:00Z'), 7)).toBe('2026-03-14');
	});
});

describe('formatReminderDate', () => {
	it('formats a YYYY-MM-DD string as Month D, YYYY', () => {
		expect(formatReminderDate('2026-03-15')).toBe('March 15, 2026');
	});

	it('formats single-digit days without zero padding', () => {
		expect(formatReminderDate('2026-01-07')).toBe('January 7, 2026');
	});

	it('formats the last day of the year correctly', () => {
		expect(formatReminderDate('2025-12-31')).toBe('December 31, 2025');
	});
});

describe('reminder entity ids', () => {
	it('namespaces the member id per reminder type', () => {
		expect(buildScheduledVisitReminderEntityIdForPerson('person_abc123')).toBe(
			'scheduled_visit:person:person_abc123'
		);
		expect(buildVisitTodayReminderEntityIdForPerson('person_abc123')).toBe(
			'visit_today:person:person_abc123'
		);
	});
});

describe('buildScheduledVisitReminderSubject', () => {
	it('includes the person name in the subject line', () => {
		const subject = buildScheduledVisitReminderSubject('Alice');
		expect(subject).toContain('Alice');
		expect(subject).toContain('one week');
	});

	it('includes the emoji marker in the subject', () => {
		expect(buildScheduledVisitReminderSubject('Bob')).toContain('📅');
	});
});

describe('buildVisitTodayReminderSubject', () => {
	it('includes the person name', () => {
		expect(buildVisitTodayReminderSubject('Mum')).toBe(
			'[Synapse] 🗓️ You have a visit with Mum today'
		);
	});
});
