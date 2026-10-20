import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { numberListSchema, safeParse, stringListSchema } from './json';

describe('safeParse', () => {
	it('returns the fallback for null, undefined, and empty input', () => {
		expect(safeParse(null, stringListSchema, [])).toEqual([]);
		expect(safeParse(undefined, z.string(), 'x')).toBe('x');
		expect(safeParse('', z.object({ a: z.number() }), { a: 1 })).toEqual({ a: 1 });
	});

	it('parses valid JSON that matches the schema', () => {
		const schema = z.object({ a: z.number(), b: numberListSchema });
		expect(safeParse('{"a":1,"b":[2]}', schema, { a: 0, b: [] })).toEqual({ a: 1, b: [2] });
	});

	it('returns the fallback for invalid JSON', () => {
		expect(safeParse('{not json', stringListSchema, ['fallback'])).toEqual(['fallback']);
	});

	it('returns the fallback for JSON of the wrong shape', () => {
		expect(safeParse('{"a":1}', stringListSchema, ['fallback'])).toEqual(['fallback']);
		expect(safeParse('[1,"two"]', numberListSchema, null)).toBeNull();
	});
});
