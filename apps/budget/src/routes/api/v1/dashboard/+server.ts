import { parseQuery } from '@sheppakai/shared/api-write';

import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiDashboardQuerySchema } from '#lib/server/api/schemas/dashboard.js';
import { getDashboardSummary } from '#lib/server/dashboard/summary.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'dashboard:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiDashboardQuerySchema);
	if (!parsed.ok) return parsed.response;

	try {
		const summary = await getDashboardSummary(url);
		return apiSuccess(summary);
	} catch (error) {
		logger.error('API: failed to load dashboard summary', error);
		return apiError('internal_error', 'Failed to load dashboard summary.', 500);
	}
};
