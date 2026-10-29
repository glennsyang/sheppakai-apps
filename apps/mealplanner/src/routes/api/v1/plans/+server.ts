import { apiError, apiSuccess } from '@sheppakai/shared/api-response';
import { parseQuery } from '@sheppakai/shared/api-write';

import { getMondayOf, parseIsoDate } from '#lib/dates.js';
import { toApiWeek } from '#lib/server/api/plans.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiPlanQuerySchema } from '#lib/server/api/schemas/plans.js';
import { logger } from '#lib/server/logger.js';
import { getMealPlanWithEntries, getMondayOfCurrentWeek } from '#lib/server/services/mealPlan.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'plans:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiPlanQuerySchema);
	if (!parsed.ok) return parsed.response;

	const { week } = parsed.data;
	const date = week ? parseIsoDate(week) : null;
	const weekStartDate = date ? getMondayOf(date) : getMondayOfCurrentWeek();

	try {
		return apiSuccess(toApiWeek(weekStartDate, await getMealPlanWithEntries(weekStartDate)));
	} catch (error) {
		logger.error('API: failed to load meal plan', error);
		return apiError('internal_error', 'Failed to load meal plan.', 500);
	}
};
