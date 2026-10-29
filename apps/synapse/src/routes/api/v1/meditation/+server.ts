import { parseQuery } from '@sheppakai/shared/api-write';
import { and, desc, eq, gte, lt } from 'drizzle-orm';

import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiMeditationListQuerySchema } from '#lib/server/api/schemas/meditation.js';
import { getDb } from '#lib/server/db/index.js';
import { meditationSessions } from '#lib/server/db/schema/index.js';
import { logger } from '#lib/server/logger.js';
import { addDaysToDateString, parseAppDateTime } from '#lib/utils/date.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'meditation:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiMeditationListQuerySchema);
	if (!parsed.ok) return parsed.response;

	const { startDate, endDate, limit } = parsed.data;

	try {
		const conditions = [eq(meditationSessions.userId, auth.userId)];
		if (startDate && endDate) {
			// completedAt is an instant; bound it by app-timezone calendar days, end-exclusive.
			conditions.push(
				gte(meditationSessions.completedAt, parseAppDateTime(`${startDate}T00:00`)),
				lt(
					meditationSessions.completedAt,
					parseAppDateTime(`${addDaysToDateString(endDate, 1)}T00:00`)
				)
			);
		}

		const results = await getDb().query.meditationSessions.findMany({
			where: and(...conditions),
			orderBy: [desc(meditationSessions.completedAt)],
			limit,
			columns: {
				id: true,
				completedAt: true,
				preMoodRating: true,
				moodRating: true,
				notes: true
			},
			with: { routine: { columns: { title: true, durationMinutes: true } } }
		});

		return apiSuccess(results);
	} catch (error) {
		logger.error('API: failed to list meditation sessions', error);
		return apiError('internal_error', 'Failed to load meditation sessions.', 500);
	}
};
