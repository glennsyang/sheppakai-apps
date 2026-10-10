/**
 * Timestamp helpers for record `createdAt`/`updatedAt` columns, which every app stores as
 * Drizzle `integer(..., { mode: 'timestamp' })` (epoch seconds, read and written as `Date`).
 *
 * Pass one `now` to every helper call in a write that touches several rows
 * (e.g. a parent and its children) so they all get the same timestamp.
 */

/** Timestamps (createdAt, updatedAt) for new records */
export function withTimestampsForCreate(now: Date = new Date()): {
	createdAt: Date;
	updatedAt: Date;
} {
	return { createdAt: now, updatedAt: now };
}

/** Timestamp (updatedAt) for updated records */
export function withTimestampsForUpdate(now: Date = new Date()): { updatedAt: Date } {
	return { updatedAt: now };
}
