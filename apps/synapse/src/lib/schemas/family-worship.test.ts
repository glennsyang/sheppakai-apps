import { describe, expect, it } from 'vitest';

import {
	sessionSchema,
	skipWeekSchema,
	topicQueueOrderSchema,
	topicSchema,
	usualWeekdaySchema
} from './family-worship';

const valid = { title: 'Prayer', description: 'How and why we pray' };

describe('topicSchema', () => {
	it('accepts a title and description, defaulting the optional fields', () => {
		expect(topicSchema.parse(valid)).toEqual({
			...valid,
			notes: '',
			scriptureReferences: '',
			publicationLinks: []
		});
	});

	it('requires a title', () => {
		const result = topicSchema.safeParse({ ...valid, title: '   ' });
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual(['title']);
		expect(result.error?.issues[0]?.message).toBe('Title is required');
	});

	it('requires a description', () => {
		const result = topicSchema.safeParse({ ...valid, description: '' });
		expect(result.error?.issues[0]?.path).toEqual(['description']);
	});

	it('accepts publication links with or without a label', () => {
		const links = [
			{ label: 'Article', url: 'https://www.jw.org/en/library/' },
			{ label: '', url: 'http://example.com/study' }
		];
		expect(topicSchema.parse({ ...valid, publicationLinks: links }).publicationLinks).toEqual(
			links
		);
	});

	it.each(['', 'not a url', 'javascript:alert(1)', 'ftp://example.com/file'])(
		'rejects %j as a link URL',
		(url) => {
			const result = topicSchema.safeParse({ ...valid, publicationLinks: [{ label: '', url }] });
			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.path).toEqual(['publicationLinks', 0, 'url']);
		}
	);
});

describe('topicQueueOrderSchema', () => {
	it('splits the posted order into topic ids', () => {
		expect(topicQueueOrderSchema.parse({ topicIds: 'b,a,c' }).topicIds).toEqual(['b', 'a', 'c']);
	});

	it('rejects an empty order', () => {
		expect(topicQueueOrderSchema.safeParse({ topicIds: '' }).success).toBe(false);
	});
});

describe('usualWeekdaySchema', () => {
	it('accepts Sunday (0) through Saturday (6) from a form string', () => {
		expect(usualWeekdaySchema.parse({ usualWeekday: '0' }).usualWeekday).toBe(0);
		expect(usualWeekdaySchema.parse({ usualWeekday: '6' }).usualWeekday).toBe(6);
	});

	it.each(['7', '-1', '2.5', 'wed'])('rejects %j as a weekday', (usualWeekday) => {
		expect(usualWeekdaySchema.safeParse({ usualWeekday }).success).toBe(false);
	});
});

describe('sessionSchema', () => {
	it('defaults the note and the follow-up flags', () => {
		expect(sessionSchema.parse({ date: '2026-11-24', topicId: 't1' })).toEqual({
			date: '2026-11-24',
			topicId: 't1',
			note: '',
			confirmUnskip: false,
			continueNextWeek: false,
			nextWeekConflict: ''
		});
	});

	it('requires a YYYY-MM-DD date and a topic', () => {
		const result = sessionSchema.safeParse({ date: '24/11/2026', topicId: '' });
		expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['date', 'topicId']);
	});

	it('only accepts replace or shift for a next-week conflict', () => {
		expect(
			sessionSchema.safeParse({ date: '2026-11-24', topicId: 't1', nextWeekConflict: 'drop' })
				.success
		).toBe(false);
	});
});

describe('skipWeekSchema', () => {
	it('takes an optional reason', () => {
		expect(skipWeekSchema.parse({ weekStart: '2026-11-23' })).toEqual({
			weekStart: '2026-11-23',
			reason: ''
		});
	});
});
