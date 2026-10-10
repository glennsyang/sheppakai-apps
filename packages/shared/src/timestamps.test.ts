import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { formatTimestamp, withTimestampsForCreate, withTimestampsForUpdate } from './timestamps';

const NOW = new Date('2026-03-15T10:30:45.123Z');

describe('formatTimestamp', () => {
	it('formats as ISO by default', () => {
		expect(formatTimestamp(NOW)).toBe('2026-03-15T10:30:45.123Z');
	});

	it('formats as SQLite current_timestamp shape', () => {
		expect(formatTimestamp(NOW, 'sqlite')).toBe('2026-03-15 10:30:45');
	});
});

describe('withTimestampsForCreate', () => {
	it('sets createdAt and updatedAt to the same value', () => {
		expect(withTimestampsForCreate(NOW)).toEqual({
			createdAt: '2026-03-15T10:30:45.123Z',
			updatedAt: '2026-03-15T10:30:45.123Z'
		});
	});

	it('supports the sqlite format', () => {
		expect(withTimestampsForCreate(NOW, 'sqlite')).toEqual({
			createdAt: '2026-03-15 10:30:45',
			updatedAt: '2026-03-15 10:30:45'
		});
	});

	it('passes the Date through for the date format', () => {
		const result = withTimestampsForCreate(NOW, 'date');

		expect(result.createdAt).toBe(NOW);
		expect(result.updatedAt).toBe(NOW);
		expectTypeOf(result.createdAt).toEqualTypeOf<Date>();
	});

	it('types string formats as strings', () => {
		expectTypeOf(withTimestampsForCreate(NOW).createdAt).toEqualTypeOf<string>();
		expectTypeOf(withTimestampsForCreate(NOW, 'sqlite').createdAt).toEqualTypeOf<string>();
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
		expect(withTimestampsForUpdate(NOW)).toEqual({ updatedAt: '2026-03-15T10:30:45.123Z' });
		expect(withTimestampsForUpdate(NOW, 'sqlite')).toEqual({ updatedAt: '2026-03-15 10:30:45' });
		expect(withTimestampsForUpdate(NOW, 'date').updatedAt).toBe(NOW);
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
		expect(formatTimestamp()).toBe('2026-03-15T10:30:45.123Z');
		expect(withTimestampsForCreate().createdAt).toBe('2026-03-15T10:30:45.123Z');
		expect(withTimestampsForUpdate().updatedAt).toBe('2026-03-15T10:30:45.123Z');
	});
});
