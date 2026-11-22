import { createHandleApiWrite } from '@sheppakai/shared/api-write';

// The shared /api/v1 write envelope, auditing to this app's `api_audit_log` table.
import { logger } from '#lib/server/logger.js';

import { recordApiWrite } from './audit-log';
import { withPublicUsers } from './public-user';

const sharedHandleApiWrite = createHandleApiWrite({ recordApiWrite, logger });

/** The shared write envelope, with each record's `user` cut down to `id` and `name`. */
export const handleApiWrite: typeof sharedHandleApiWrite = (context, perform, options) =>
	sharedHandleApiWrite(context, async () => withPublicUsers(await perform()), options);
