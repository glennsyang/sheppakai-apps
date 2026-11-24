import { describe, expect, it } from 'vitest';

import {
	buildScheduledVisitReminderEntityIdForPerson,
	buildScheduledVisitReminderSubject,
	buildVisitTodayReminderEntityIdForPerson,
	buildVisitTodayReminderSubject,
	formatReminderDate
} from './scheduled-visit-reminder-utils';

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
