import { parseQuery } from '@sheppakai/shared/api-write';

import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiAgendaQuerySchema } from '#lib/server/api/schemas/agenda.js';
import { loadDailyAgendaEntriesForDate } from '#lib/server/daily-agenda.js';
import { logger } from '#lib/server/logger.js';
import { getTodayString } from '#lib/utils/date.js';

import type { RequestHandler } from './$types';

/** One day's agenda, in display order, with each item's completion state. */
export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'agenda:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiAgendaQuerySchema);
	if (!parsed.ok) return parsed.response;

	const date = parsed.data.date ?? getTodayString();

	try {
		const entries = await loadDailyAgendaEntriesForDate(auth.userId, date);

		return apiSuccess({
			date,
			entries: entries.map((entry) => ({
				id: entry.id,
				title: entry.title,
				sourceType: entry.sourceType,
				completed: entry.completed,
				completedAt: entry.completedAt
			}))
		});
	} catch (error) {
		logger.error('API: failed to load daily agenda', error);
		return apiError('internal_error', 'Failed to load the daily agenda.', 500);
	}
};
