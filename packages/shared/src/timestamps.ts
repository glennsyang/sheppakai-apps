/**
 * Timestamp helpers for record `createdAt`/`updatedAt` columns.
 *
 * Pass one `now` to every helper call in a write that touches several rows
 * (e.g. a parent and its children) so they all get the same timestamp.
 */

/**
 * - `iso`: `2026-03-15T10:30:00.000Z` (synapse)
 * - `sqlite`: `2026-03-15 10:30:00`, UTC, same shape as SQLite's `current_timestamp` (budget)
 */
export type TimestampFormat = 'iso' | 'sqlite';

export function formatTimestamp(date: Date = new Date(), format: TimestampFormat = 'iso'): string {
	const iso = date.toISOString();
	return format === 'sqlite' ? iso.replace('T', ' ').split('.')[0] : iso;
}

/** Timestamps (createdAt, updatedAt) for new records */
export function withTimestampsForCreate(now: Date = new Date(), format: TimestampFormat = 'iso') {
	const timestamp = formatTimestamp(now, format);
	return { createdAt: timestamp, updatedAt: timestamp };
}

/** Timestamp (updatedAt) for updated records */
export function withTimestampsForUpdate(now: Date = new Date(), format: TimestampFormat = 'iso') {
	return { updatedAt: formatTimestamp(now, format) };
}
