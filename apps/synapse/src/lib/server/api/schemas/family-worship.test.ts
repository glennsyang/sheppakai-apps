import { describe, expect, it } from 'vitest';

import {
	apiLogSessionSchema,
	apiScheduleQuerySchema,
	apiTopicListQuerySchema,
	apiUpdateSessionSchema
} from './family-worship';

describe('apiLogSessionSchema', () => {
	it('defaults to a done session and requires its topic', () => {
		expect(apiLogSessionSchema.safeParse({ date: '2026-11-18' }).success).toBe(false);
		const result = apiLogSessionSchema.safeParse({ date: '2026-11-18', topicId: 't1' });
		expect(result.data?.status).toBe('done');
	});

	it('accepts a skipped week without a topic', () => {
		expect(apiLogSessionSchema.safeParse({ date: '2026-11-18', status: 'skipped' }).success).toBe(
			true
		);
	});

	it('rejects a malformed date', () => {
		expect(apiLogSessionSchema.safeParse({ date: '11/18/2026', topicId: 't1' }).success).toBe(
			false
		);
	});
});

describe('apiUpdateSessionSchema', () => {
	it('accepts an empty partial update', () => {
		expect(apiUpdateSessionSchema.safeParse({}).success).toBe(true);
	});
});

describe('query schemas', () => {
	it('parses includeArchived and defaults it to false', () => {
		expect(apiTopicListQuerySchema.parse({}).includeArchived).toBe(false);
		expect(apiTopicListQuerySchema.parse({ includeArchived: 'true' }).includeArchived).toBe(true);
	});

	it('defaults the schedule window to 8 weeks and caps it', () => {
		expect(apiScheduleQuerySchema.parse({}).weeks).toBe(8);
		expect(apiScheduleQuerySchema.safeParse({ weeks: '100' }).success).toBe(false);
	});
});
