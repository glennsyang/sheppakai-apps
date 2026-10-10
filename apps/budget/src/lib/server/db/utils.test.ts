import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

// WithUpdatedAt stamps updatedAt from the clock by default, so we
// Can control the clock via fake timers.
import { generateId, withUpdatedAt } from './utils';

describe('withUpdatedAt', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-15T10:30:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('adds updatedAt as a Date from the clock', () => {
		const result = withUpdatedAt({ amount: 200 });
		expect(result.updatedAt).toEqual(new Date('2026-03-15T10:30:00.000Z'));
	});

	it('uses the given now instead of the clock', () => {
		const now = new Date('2025-01-02T03:04:05.678Z');
		expect(withUpdatedAt({ amount: 200 }, now).updatedAt).toBe(now);
	});

	it('preserves all original data fields', () => {
		const result = withUpdatedAt({ amount: 99, name: 'updated name' });

		expect(result.name).toBe('updated name');
		expect(result.amount).toBe(99);
	});

	it('does not mutate the original data object', () => {
		const data = { name: 'original' };
		withUpdatedAt(data);

		expect(Object.keys(data)).not.toContain('updatedAt');
	});
});

describe('generateId', () => {
	it('returns a non-empty string', () => {
		expectTypeOf(generateId()).toBeString();
		expect(generateId().length).toBeGreaterThan(0);
	});

	it('returns a value matching UUID v4 format', () => {
		const uuid = generateId();
		expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	});

	it('returns a unique value on each call', () => {
		const ids = new Set(Array.from({ length: 20 }, generateId));
		expect(ids.size).toBe(20);
	});
});
