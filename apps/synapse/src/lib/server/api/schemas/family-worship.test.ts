import { describe, expect, it } from 'vitest';

import {
	apiCreateSessionSchema,
	apiPlanQuerySchema,
	apiPlanWeekSchema,
	apiSessionListQuerySchema,
	apiSkipWeekSchema,
	apiUpdateSessionSchema
} from './family-worship';

describe('apiPlanQuerySchema', () => {
	it('defaults to 8 weeks ahead and 4 weeks back', () => {
		expect(apiPlanQuerySchema.parse({})).toEqual({ weeks: 8, lookbackWeeks: 4 });
	});

	it('coerces query-string numbers', () => {
		expect(apiPlanQuerySchema.parse({ weeks: '2', lookbackWeeks: '0' })).toEqual({
			weeks: 2,
			lookbackWeeks: 0
		});
	});

	it('rejects out-of-range weeks', () => {
		expect(apiPlanQuerySchema.safeParse({ weeks: '0' }).success).toBe(false);
		expect(apiPlanQuerySchema.safeParse({ weeks: '27' }).success).toBe(false);
		expect(apiPlanQuerySchema.safeParse({ lookbackWeeks: '13' }).success).toBe(false);
	});
});

describe('apiPlanWeekSchema', () => {
	it('requires a topicId', () => {
		expect(apiPlanWeekSchema.safeParse({}).success).toBe(false);
		expect(apiPlanWeekSchema.safeParse({ topicId: 'topic-1' }).success).toBe(true);
	});
});

describe('apiSessionListQuerySchema', () => {
	it('defaults limit to 50 and leaves topicId optional', () => {
		expect(apiSessionListQuerySchema.parse({})).toEqual({ limit: 50 });
	});

	it('rejects a limit over 200', () => {
		expect(apiSessionListQuerySchema.safeParse({ limit: '201' }).success).toBe(false);
	});
});

describe('apiCreateSessionSchema', () => {
	it('accepts a minimal session and defaults the flags to false', () => {
		expect(apiCreateSessionSchema.parse({ date: '2026-11-25', topicId: 'topic-1' })).toEqual({
			date: '2026-11-25',
			topicId: 'topic-1',
			confirmUnskip: false,
			continueNextWeek: false
		});
	});

	it('requires date and topicId', () => {
		expect(apiCreateSessionSchema.safeParse({ topicId: 'topic-1' }).success).toBe(false);
		expect(apiCreateSessionSchema.safeParse({ date: '2026-11-25' }).success).toBe(false);
	});

	it('rejects a malformed date', () => {
		expect(
			apiCreateSessionSchema.safeParse({ date: '25/11/2026', topicId: 'topic-1' }).success
		).toBe(false);
	});

	it('accepts only replace or shift for nextWeekConflict', () => {
		const base = { date: '2026-11-25', topicId: 'topic-1', continueNextWeek: true };
		expect(apiCreateSessionSchema.safeParse({ ...base, nextWeekConflict: 'shift' }).success).toBe(
			true
		);
		expect(apiCreateSessionSchema.safeParse({ ...base, nextWeekConflict: 'merge' }).success).toBe(
			false
		);
	});

	it('requires boolean flags, not strings', () => {
		expect(
			apiCreateSessionSchema.safeParse({
				date: '2026-11-25',
				topicId: 'topic-1',
				confirmUnskip: 'true'
			}).success
		).toBe(false);
	});
});

describe('apiUpdateSessionSchema', () => {
	it('accepts a partial update', () => {
		expect(apiUpdateSessionSchema.safeParse({ note: 'Good discussion' }).success).toBe(true);
	});

	it('accepts clearing the note', () => {
		expect(apiUpdateSessionSchema.safeParse({ note: null }).success).toBe(true);
	});

	it('rejects an update with nothing to change', () => {
		expect(apiUpdateSessionSchema.safeParse({}).success).toBe(false);
		expect(apiUpdateSessionSchema.safeParse({ confirmUnskip: true }).success).toBe(false);
	});
});

describe('apiSkipWeekSchema', () => {
	it('requires a weekStart and allows an optional reason', () => {
		expect(apiSkipWeekSchema.safeParse({}).success).toBe(false);
		expect(apiSkipWeekSchema.safeParse({ weekStart: '2026-11-23' }).success).toBe(true);
		expect(
			apiSkipWeekSchema.safeParse({ weekStart: '2026-11-23', reason: 'Convention' }).success
		).toBe(true);
	});

	it('rejects a reason over 200 characters', () => {
		expect(
			apiSkipWeekSchema.safeParse({ weekStart: '2026-11-23', reason: 'x'.repeat(201) }).success
		).toBe(false);
	});
});
