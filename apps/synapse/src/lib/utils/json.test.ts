import { describe, expect, it } from 'vitest';

import { safeParse } from './json';

describe('safeParse', () => {
	it('returns the fallback for null, undefined, and empty input', () => {
		expect(safeParse(null, [])).toEqual([]);
		expect(safeParse(undefined, 'x')).toBe('x');
		expect(safeParse('', { a: 1 })).toEqual({ a: 1 });
	});

	it('parses valid JSON', () => {
		expect(safeParse('{"a":1,"b":[2]}', {})).toEqual({ a: 1, b: [2] });
	});

	it('returns the fallback for invalid JSON', () => {
		expect(safeParse('{not json', ['fallback'])).toEqual(['fallback']);
	});
});
