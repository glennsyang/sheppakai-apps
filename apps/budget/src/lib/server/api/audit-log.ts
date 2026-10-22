import { createListApiAuditEntries, createRecordApiWrite } from '@sheppakai/shared/api-audit-log';
import { desc, inArray } from 'drizzle-orm';

// The shared API audit log, reading and writing this app's `api_audit_log` table.
import { getDb } from '#lib/server/db/index.js';
import { apiAuditLog, apiKey } from '#lib/server/db/schema/index.js';
import { logger } from '#lib/server/logger.js';

export const recordApiWrite = createRecordApiWrite({
	insert: (entry) => getDb().insert(apiAuditLog).values(entry),
	logger
});

export const listApiAuditEntries = createListApiAuditEntries({
	findEntries: (limit) =>
		getDb().query.apiAuditLog.findMany({
			with: { user: true },
			orderBy: [desc(apiAuditLog.createdAt)],
			limit
		}),
	findKeyNames: (ids) =>
		getDb().select({ id: apiKey.id, name: apiKey.name }).from(apiKey).where(inArray(apiKey.id, ids))
});
