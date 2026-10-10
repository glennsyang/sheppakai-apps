import { randomUUID } from 'node:crypto';

// Helper function to generate a UUID for new records
export const generateId = () => randomUUID();

export { withTimestampsForCreate, withTimestampsForUpdate } from '@sheppakai/shared/timestamps';
