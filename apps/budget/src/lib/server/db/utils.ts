import { randomUUID } from 'node:crypto';

import { withTimestampsForUpdate } from '@sheppakai/shared/timestamps';

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
	return { ...data, ...withTimestampsForUpdate(now, 'date') };
}
