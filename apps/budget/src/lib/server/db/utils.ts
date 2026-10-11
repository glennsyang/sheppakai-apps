import { randomUUID } from 'node:crypto';

import { withTimestampsForUpdate } from '@sheppakai/shared/timestamps';
import { type SQL, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

// Helper function to generate a UUID for new records
export const generateId = () => randomUUID();

/**
 * Stamp updatedAt on updated records (createdAt/updatedAt on inserts come from column defaults)
 * @param data Original data object
 * @param now Timestamp to use; pass the same one to every row in a multi-row write
 */
export function withUpdatedAt<T extends Record<string, unknown>>(
	data: T,
	now: Date = new Date()
): T & { updatedAt: Date } {
	return { ...data, ...withTimestampsForUpdate(now) };
}

/**
 * Inclusive calendar-day range on a text date column, written so SQLite can use an index
 * on `column`. Stored values mix `YYYY-MM-DD` and `YYYY-MM-DD HH:MM:SS`, so the upper bound
 * is the start of the day after `endDate` rather than `<= endDate`. Spread into `and(...)`.
 */
export function dateInRange(column: SQLiteColumn, startDate: string, endDate: string): SQL[] {
	return [sql`${column} >= date(${startDate})`, sql`${column} < date(${endDate}, '+1 day')`];
}
