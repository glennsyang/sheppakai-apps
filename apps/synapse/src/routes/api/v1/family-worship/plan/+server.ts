import { parseQuery } from '@sheppakai/shared/api-write';

import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiPlanQuerySchema } from '#lib/server/api/schemas/family-worship.js';
import { getDb } from '#lib/server/db/index.js';
import { getPlan } from '#lib/server/family-worship/family-worship.js';
import { logger } from '#lib/server/logger.js';
import { getTodayString } from '#lib/utils/date.js';

import type { RequestHandler } from './$types';

/**
 * This week and the upcoming weeks, plus recent unlogged past weeks. Each row carries its
 * plannedTopic, session, skip and (for an empty current or upcoming week) suggestion.
 */
export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'family-worship:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiPlanQuerySchema);
	if (!parsed.ok) return parsed.response;

	try {
		return apiSuccess(getPlan(getDb(), auth.userId, { today: getTodayString(), ...parsed.data }));
	} catch (error) {
		logger.error('API: failed to load family worship plan', error);
		return apiError('internal_error', 'Failed to load the plan.', 500);
	}
};
