import { describe, expect, it } from 'vitest';

import { familyWorshipApiError } from './family-worship';

describe('familyWorshipApiError', () => {
	it.each([
		[{ reason: 'not_found' as const }, 'not_found', 404],
		[{ reason: 'invalid_week' as const }, 'validation_failed', 400],
		[{ reason: 'future_date' as const }, 'validation_failed', 400],
		[{ reason: 'week_skipped' as const }, 'conflict', 409],
		[{ reason: 'week_has_session' as const, sessionId: 's1' }, 'conflict', 409],
		[{ reason: 'next_week_conflict' as const, topicTitle: 'Psalm 23' }, 'conflict', 409],
		[{ reason: 'next_week_skipped' as const }, 'conflict', 409],
		[{ reason: 'next_week_has_session' as const }, 'conflict', 409]
	])('maps %o to %s (%i) and keeps the reason', (failure, code, status) => {
		const error = familyWorshipApiError(failure, 'session');
		expect(error).toMatchObject({ code, status, reason: failure.reason });
	});

	it('tells a client how to log into a Skipped Week', () => {
		expect(familyWorshipApiError({ reason: 'week_skipped' }, 'session').message).toContain(
			'confirmUnskip: true'
		);
		expect(familyWorshipApiError({ reason: 'week_skipped' }, 'plan').message).not.toContain(
			'confirmUnskip'
		);
	});

	it('names the conflicting topic and both choices for a next-week conflict', () => {
		const { message } = familyWorshipApiError(
			{ reason: 'next_week_conflict', topicTitle: 'Psalm 23' },
			'session'
		);
		expect(message).toContain('Psalm 23');
		expect(message).toContain('"replace"');
		expect(message).toContain('"shift"');
	});
});
