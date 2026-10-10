/**
 * Timestamp helpers for record `createdAt`/`updatedAt` columns.
 *
 * Pass one `now` to every helper call in a write that touches several rows
 * (e.g. a parent and its children) so they all get the same timestamp.
 */

/**
 * - `iso`: `2026-03-15T10:30:00.000Z` (synapse)
 * - `sqlite`: `2026-03-15 10:30:00`, UTC, same shape as SQLite's `current_timestamp` (budget)
 * - `date`: the `Date` itself, for Drizzle `integer(..., { mode: 'timestamp' })` columns (mealplanner)
 */
export type TimestampFormat = 'iso' | 'sqlite' | 'date';

type TimestampValue<F extends TimestampFormat> = F extends 'date' ? Date : string;

export function formatTimestamp(
	date: Date = new Date(),
	format: Exclude<TimestampFormat, 'date'> = 'iso'
): string {
	const iso = date.toISOString();
	return format === 'sqlite' ? iso.replace('T', ' ').split('.')[0] : iso;
}

function toTimestamp<F extends TimestampFormat>(now: Date, format: F): TimestampValue<F> {
	return (format === 'date' ? now : formatTimestamp(now, format)) as TimestampValue<F>;
}

/** Timestamps (createdAt, updatedAt) for new records */
export function withTimestampsForCreate<F extends TimestampFormat = 'iso'>(
	now: Date = new Date(),
	format: F = 'iso' as F
): { createdAt: TimestampValue<F>; updatedAt: TimestampValue<F> } {
	const timestamp = toTimestamp(now, format);
	return { createdAt: timestamp, updatedAt: timestamp };
}

/** Timestamp (updatedAt) for updated records */
export function withTimestampsForUpdate<F extends TimestampFormat = 'iso'>(
	now: Date = new Date(),
	format: F = 'iso' as F
): { updatedAt: TimestampValue<F> } {
	return { updatedAt: toTimestamp(now, format) };
}
