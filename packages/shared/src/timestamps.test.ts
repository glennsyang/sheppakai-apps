import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { withTimestampsForCreate, withTimestampsForUpdate } from './timestamps';

const NOW = new Date('2026-03-15T10:30:45.123Z');

describe('withTimestampsForCreate', () => {
	it('sets createdAt and updatedAt to the given Date', () => {
		const result = withTimestampsForCreate(NOW);

		expect(result.createdAt).toBe(NOW);
		expect(result.updatedAt).toBe(NOW);
		expectTypeOf(result.createdAt).toEqualTypeOf<Date>();
	});

	it('gives every row the same timestamp when given one now', () => {
		const now = new Date();
		const parent = withTimestampsForCreate(now);
		const child = withTimestampsForCreate(now);

		expect(child).toEqual(parent);
	});
});

describe('withTimestampsForUpdate', () => {
	it('sets updatedAt only', () => {
		expect(withTimestampsForUpdate(NOW)).toEqual({ updatedAt: NOW });
	});
});

describe('default now', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('reads the current clock', () => {
		expect(withTimestampsForCreate().createdAt).toEqual(NOW);
		expect(withTimestampsForUpdate().updatedAt).toEqual(NOW);
	});
});
