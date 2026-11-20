import { parseQuery } from '@sheppakai/shared/api-write';

import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiScheduleQuerySchema } from '#lib/server/api/schemas/family-worship.js';
import { getDb } from '#lib/server/db/index.js';
import { loadFamilyWorship } from '#lib/server/family-worship.js';
import { logger } from '#lib/server/logger.js';
import { getTodayString } from '#lib/utils/date.js';
import { getWeekStatus } from '#lib/utils/family-worship.js';

import type { RequestHandler } from './$types';

/** This week's Wednesday onward: scheduled topic, rotation suggestion and any logged session. */
export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'family-worship:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiScheduleQuerySchema);
	if (!parsed.ok) return parsed.response;

	try {
		const today = getTodayString();
		const { upcoming } = await loadFamilyWorship(getDb(), auth.userId, today, parsed.data.weeks);
		return apiSuccess(upcoming.map((week) => ({ ...week, status: getWeekStatus(week, today) })));
	} catch (error) {
		logger.error('API: failed to load family worship schedule', error);
		return apiError('internal_error', 'Failed to load schedule.', 500);
	}
};
