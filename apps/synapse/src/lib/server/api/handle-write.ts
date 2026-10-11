// The shared /api/v1 write envelope, auditing to this app's `api_audit_log` table.
import { logger } from '$lib/server/logger';
import { createHandleApiWrite } from '@sheppakai/shared/api-write';

import { recordApiWrite } from './audit-log';

export const handleApiWrite = createHandleApiWrite({ recordApiWrite, logger });
