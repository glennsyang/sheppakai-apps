import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { numberListSchema, safeParse, stringListSchema } from './json';

const warn = vi.hoisted(() => vi.fn<(message: string, meta?: Record<string, unknown>) => void>());
vi.mock('#lib/server/logger.js', () => ({ logger: { warn } }));

describe('safeParse', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the fallback quietly for null, undefined, and empty input', () => {
		expect(safeParse(null, stringListSchema, [], 'test')).toEqual([]);
		expect(safeParse(undefined, z.string(), 'x', 'test')).toBe('x');
		expect(safeParse('', z.object({ a: z.number() }), { a: 1 }, 'test')).toEqual({ a: 1 });
		expect(warn).not.toHaveBeenCalled();
	});

	it('parses valid JSON that matches the schema', () => {
		const schema = z.object({ a: z.number(), b: numberListSchema });
		expect(safeParse('{"a":1,"b":[2]}', schema, { a: 0, b: [] }, 'test')).toEqual({
			a: 1,
			b: [2]
		});
		expect(warn).not.toHaveBeenCalled();
	});

	it('logs and returns the fallback for invalid JSON', () => {
		expect(safeParse('{not json', stringListSchema, ['fallback'], 'visits.companions')).toEqual([
			'fallback'
		]);
		expect(warn).toHaveBeenCalledWith('JSON value is not valid JSON; using fallback', {
			field: 'visits.companions'
		});
	});

	it('logs the failing paths, not the values, for JSON of the wrong shape', () => {
		expect(safeParse('[1,"two"]', numberListSchema, null, 'schedule.daysOfWeek')).toBeNull();
		expect(warn).toHaveBeenCalledWith('JSON value failed its schema check; using fallback', {
			field: 'schedule.daysOfWeek',
			issues: ['1']
		});

		expect(safeParse('{"a":1}', stringListSchema, ['fallback'], 'routine.moodTags')).toEqual([
			'fallback'
		]);
		expect(warn).toHaveBeenLastCalledWith('JSON value failed its schema check; using fallback', {
			field: 'routine.moodTags',
			issues: ['(root)']
		});
	});
});
