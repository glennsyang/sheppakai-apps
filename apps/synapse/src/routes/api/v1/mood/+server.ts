import { parseJsonBody } from '@sheppakai/shared/api-write';
import { and, asc, eq, gte, lte } from 'drizzle-orm';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiMoodListQuerySchema, apiUpsertMoodSchema } from '#lib/server/api/schemas/mood.js';
import { getDb } from '#lib/server/db/index.js';
import { moodLogs } from '#lib/server/db/schema/index.js';
import { upsertMood } from '#lib/server/db/writes/mood.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'mood:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = apiMoodListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return apiError('validation_failed', parsed.error.issues.map((i) => i.message).join('; '), 400);
	}

	const { startDate, endDate } = parsed.data;

	try {
		const conditions = [eq(moodLogs.userId, auth.userId)];
		if (startDate && endDate) {
			conditions.push(gte(moodLogs.date, startDate), lte(moodLogs.date, endDate));
		}

		const results = await getDb().query.moodLogs.findMany({
			where: and(...conditions),
			orderBy: [asc(moodLogs.date)]
		});

		return apiSuccess(results);
	} catch (error) {
		logger.error('API: failed to list mood logs', error);
		return apiError('internal_error', 'Failed to load mood logs.', 500);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'mood:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiUpsertMoodSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'mood:write'
		},
		() => upsertMood(auth.userId, parsed.data),
		{ successStatus: 200, failureMessage: 'Failed to save mood log' }
	);
};
