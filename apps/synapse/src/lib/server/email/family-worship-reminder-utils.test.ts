import { describe, expect, it } from 'vitest';

import {
	buildFamilyWorshipReminderSubject,
	getReminderTopic,
	isFamilyWorshipReminderTime
} from './family-worship-reminder-utils';

describe('isFamilyWorshipReminderTime', () => {
	it('fires on Wednesday from 09:00 Pacific', () => {
		expect(isFamilyWorshipReminderTime(3, '08', '37')).toBe(false);
		expect(isFamilyWorshipReminderTime(3, '09', '00')).toBe(true);
		expect(isFamilyWorshipReminderTime(3, '09', '07')).toBe(true);
		expect(isFamilyWorshipReminderTime(3, '21', '37')).toBe(true);
	});

	it('never fires on other days', () => {
		expect(isFamilyWorshipReminderTime(2, '09', '07')).toBe(false);
		expect(isFamilyWorshipReminderTime(4, '09', '07')).toBe(false);
	});
});

describe('getReminderTopic', () => {
	const base = { weekOf: '2026-11-18', scheduledTopic: null, suggestedTopic: null, session: null };

	it('prefers the scheduled topic over the suggestion', () => {
		expect(
			getReminderTopic({
				...base,
				scheduledTopic: { id: 'a', title: 'A' },
				suggestedTopic: { id: 'b', title: 'B' }
			})?.id
		).toBe('a');
		expect(getReminderTopic({ ...base, suggestedTopic: { id: 'b', title: 'B' } })?.id).toBe('b');
	});

	it('skips a logged week and a week with nothing planned', () => {
		expect(
			getReminderTopic({
				...base,
				scheduledTopic: { id: 'a', title: 'A' },
				session: {
					id: 's',
					weekOf: '2026-11-18',
					date: '2026-11-18',
					status: 'done',
					topicId: 'a',
					notes: null
				}
			})
		).toBeNull();
		expect(getReminderTopic(base)).toBeNull();
		expect(getReminderTopic(undefined)).toBeNull();
	});
});

describe('buildFamilyWorshipReminderSubject', () => {
	it('names the topic', () => {
		expect(buildFamilyWorshipReminderSubject('Jonah')).toBe(
			'[Synapse] 📖 Family worship tonight: Jonah'
		);
	});
});
