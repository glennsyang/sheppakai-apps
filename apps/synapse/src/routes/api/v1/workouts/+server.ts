import { parseJsonBody } from '@sheppakai/shared/api-write';
import { and, desc, eq, gte, lte } from 'drizzle-orm';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import {
	apiCreateWorkoutSchema,
	apiWorkoutListQuerySchema
} from '#lib/server/api/schemas/workouts.js';
import { getDb } from '#lib/server/db/index.js';
import { workoutLogs } from '#lib/server/db/schema/index.js';
import { createWorkout } from '#lib/server/db/writes/workouts.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'workouts:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = apiWorkoutListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return apiError('validation_failed', parsed.error.issues.map((i) => i.message).join('; '), 400);
	}

	const { startDate, endDate, type, limit } = parsed.data;

	try {
		const conditions = [eq(workoutLogs.userId, auth.userId)];
		if (startDate && endDate) {
			conditions.push(gte(workoutLogs.date, startDate), lte(workoutLogs.date, endDate));
		}
		if (type) conditions.push(eq(workoutLogs.type, type));

		const results = await getDb().query.workoutLogs.findMany({
			where: and(...conditions),
			orderBy: [desc(workoutLogs.date)],
			limit
		});

		return apiSuccess(results);
	} catch (error) {
		logger.error('API: failed to list workouts', error);
		return apiError('internal_error', 'Failed to load workouts.', 500);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'workouts:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiCreateWorkoutSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'workouts:write'
		},
		() => createWorkout(auth.userId, parsed.data),
		{ successStatus: 201, failureMessage: 'Failed to create workout' }
	);
};
