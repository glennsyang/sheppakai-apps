// The shared API audit log, writing to this app's `api_audit_log` table.
import { getDb } from '$lib/server/db';
import { apiAuditLog } from '$lib/server/db/schema';
import { logger } from '$lib/server/logger';
import { createRecordApiWrite } from '@sheppakai/shared/api-audit-log';

export const recordApiWrite = createRecordApiWrite({
	insert: (entry) => getDb().insert(apiAuditLog).values(entry),
	logger
});
