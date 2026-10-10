import { randomUUID } from 'node:crypto';

import {
	withTimestampsForCreate as sharedWithTimestampsForCreate,
	withTimestampsForUpdate as sharedWithTimestampsForUpdate
} from '@sheppakai/shared/timestamps';

// Helper function to generate a UUID for new records
export const generateId = () => randomUUID();

// Mealplanner timestamp columns are `integer(..., { mode: 'timestamp' })`, so they take Dates

/** Timestamps (createdAt, updatedAt) for new records */
export const withTimestampsForCreate = (now: Date = new Date()) =>
	sharedWithTimestampsForCreate(now, 'date');

/** Timestamp (updatedAt) for updated records */
export const withTimestampsForUpdate = (now: Date = new Date()) =>
	sharedWithTimestampsForUpdate(now, 'date');
