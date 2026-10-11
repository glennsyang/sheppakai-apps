// WithUpdatedAt stamps updatedAt from the clock by default, so we
// Can control the clock via fake timers.
import Database from 'better-sqlite3';
import { and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { dateInRange, generateId, withUpdatedAt } from './utils';

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

describe('dateInRange', () => {
	const rows = sqliteTable('rows', { date: text('date').notNull() });

	function countInRange(dates: string[], start: string, end: string) {
		const sqlite = new Database(':memory:');
		sqlite.exec('CREATE TABLE rows (date TEXT NOT NULL)');
		const insert = sqlite.prepare('INSERT INTO rows (date) VALUES (?)');
		for (const date of dates) insert.run(date);
		return drizzle(sqlite)
			.select()
			.from(rows)
			.where(and(...dateInRange(rows.date, start, end)))
			.all().length;
	}

	it('includes both bounds for date-only and date-time values', () => {
		const dates = [
			'2026-01-01',
			'2026-01-01 00:00:00',
			'2026-01-31',
			'2026-01-31 23:59:59',
			'2025-12-31 23:59:59',
			'2026-02-01',
			'2026-02-01 00:00:00'
		];
		expect(countInRange(dates, '2026-01-01', '2026-01-31')).toBe(4);
	});

	it('excludes empty dates', () => {
		expect(countInRange(['', '2026-01-15'], '2026-01-01', '2026-01-31')).toBe(1);
	});
});
