import { describe, expect, it } from 'vitest';

import { isRecord } from './guards';

describe('isRecord', () => {
	it('accepts plain objects and class instances', () => {
		expect(isRecord({})).toBe(true);
		expect(isRecord({ a: 1 })).toBe(true);
		expect(isRecord(new Error('x'))).toBe(true);
	});

	it('rejects null, arrays and primitives', () => {
		expect(isRecord(null)).toBe(false);
		expect(isRecord(undefined)).toBe(false);
		expect(isRecord([])).toBe(false);
		expect(isRecord('x')).toBe(false);
		expect(isRecord(1)).toBe(false);
	});
});
