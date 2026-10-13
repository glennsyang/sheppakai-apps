import { createRecordApiWrite } from '@sheppakai/shared/api-audit-log';

// The shared API audit log, writing to this app's `api_audit_log` table.
import { getDb } from '#lib/server/db/index.js';
import { apiAuditLog } from '#lib/server/db/schema/index.js';
import { logger } from '#lib/server/logger.js';

export const recordApiWrite = createRecordApiWrite({
	insert: (entry) => getDb().insert(apiAuditLog).values(entry),
	logger
});
