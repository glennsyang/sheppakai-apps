import { describe, expect, it } from 'vitest';

import { scheduleWeekSchema, sessionSchema, topicSchema } from './family-worship';

describe('topicSchema', () => {
	it('accepts a title-only topic', () => {
		expect(topicSchema.safeParse({ title: 'Jonah' }).success).toBe(true);
	});

	it('requires a title', () => {
		expect(topicSchema.safeParse({ title: '  ' }).success).toBe(false);
	});

	it('accepts one http(s) link per line and rejects anything else', () => {
		expect(
			topicSchema.safeParse({ title: 'A', links: 'https://wol.jw.org/a\n\nhttp://b.example' })
				.success
		).toBe(true);
		expect(topicSchema.safeParse({ title: 'A', links: 'javascript:alert(1)' }).success).toBe(false);
	});
});

describe('scheduleWeekSchema', () => {
	it('allows clearing a week with no topic', () => {
		expect(scheduleWeekSchema.safeParse({ weekOf: '2026-11-18' }).success).toBe(true);
	});
});

describe('sessionSchema', () => {
	it('requires a topic for a done session', () => {
		const result = sessionSchema.safeParse({ status: 'done', date: '2026-11-18' });
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual(['topicId']);
	});

	it('allows a skipped week without a topic', () => {
		expect(sessionSchema.safeParse({ status: 'skipped', date: '2026-11-18' }).success).toBe(true);
	});

	it('reads the continue-next-week checkbox', () => {
		const result = sessionSchema.safeParse({
			date: '2026-11-18',
			topicId: 't1',
			continueNextWeek: 'on'
		});
		expect(result.data?.continueNextWeek).toBe(true);
		expect(result.data?.status).toBe('done');
	});
});
