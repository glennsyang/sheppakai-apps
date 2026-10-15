import { parseQuery } from '@sheppakai/shared/api-write';

import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiBudgetsQuerySchema } from '#lib/server/api/schemas/budgets.js';
import { budgetQueries } from '#lib/server/db/queries/index.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'budgets:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiBudgetsQuerySchema);
	if (!parsed.ok) return parsed.response;

	const { month, year } = parsed.data;
	if (year === undefined) {
		return apiError('validation_failed', 'year is required', 400);
	}

	try {
		const budgets = month
			? await budgetQueries.findByMonthYear(month, year)
			: await budgetQueries.findByYear(year);
		return apiSuccess(budgets);
	} catch (error) {
		logger.error('API: failed to list budgets', error);
		return apiError('internal_error', 'Failed to load budgets.', 500);
	}
};
