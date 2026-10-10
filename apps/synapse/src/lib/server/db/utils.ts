import { randomUUID } from 'node:crypto';

// Helper function to generate a UUID for new records
export const generateId = () => randomUUID();

/** Timestamps (createdAt, updatedAt) for new records */
export function withTimestampsForCreate() {
	const now = new Date().toISOString();
	return { createdAt: now, updatedAt: now };
}

/** Timestamp (updatedAt) for updated records */
export function withTimestampsForUpdate() {
	return { updatedAt: new Date().toISOString() };
}
