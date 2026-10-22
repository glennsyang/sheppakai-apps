import { assertAdmin } from '#lib/server/actions/auth-guard.js';
import { listApiAuditEntries } from '#lib/server/api/audit-log.js';
import { logger } from '#lib/server/logger.js';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	assertAdmin(locals);

	try {
		const entries = await listApiAuditEntries();

		return { entries };
	} catch (error) {
		logger.error('Failed to load API audit log', error);
		return {
			entries: [],
			loadError: 'Failed to load API logs. Please try refreshing the page.'
		};
	}
};
