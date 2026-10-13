import { ApiWriteError } from '@sheppakai/shared/api-write';
import { parseJsonBody } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiUpdateWorkoutSchema } from '#lib/server/api/schemas/workouts.js';
import { getWorkoutWithExercises, updateWorkout } from '#lib/server/db/writes/workouts.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const auth = await requireApiKey(request, 'workouts:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	try {
		const workout = await getWorkoutWithExercises(auth.userId, params.id);
		return apiSuccess(workout);
	} catch (error) {
		if (error instanceof ApiWriteError) {
			return apiError(error.code, error.message, error.status);
		}
		logger.error('API: failed to load workout', error);
		return apiError('internal_error', 'Failed to load workout.', 500);
	}
};

export const PATCH: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'workouts:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiUpdateWorkoutSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'PATCH',
			path: url.pathname,
			action: 'workouts:write'
		},
		() => updateWorkout(auth.userId, params.id, parsed.data),
		{ successStatus: 200, failureMessage: 'Failed to update workout' }
	);
};
