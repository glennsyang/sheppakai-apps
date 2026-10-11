import { handleApiWrite } from '$lib/server/api/handle-write';
import { requireApiKey } from '$lib/server/api/require-api-key';
import { apiError, apiSuccess } from '$lib/server/api/response';
import { apiUpdateMealSchema } from '$lib/server/api/schemas/meals';
import { getDb } from '$lib/server/db';
import { mealLogs } from '$lib/server/db/schema';
import { updateMeal } from '$lib/server/db/writes/meals';
import { logger } from '$lib/server/logger';
import { parseJsonBody } from '@sheppakai/shared/api-write';
import { and, eq } from 'drizzle-orm';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const auth = await requireApiKey(request, 'meals:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	try {
		const meal = await getDb().query.mealLogs.findFirst({
			where: and(eq(mealLogs.id, params.id), eq(mealLogs.userId, auth.userId))
		});

		if (!meal) {
			return apiError('not_found', 'Meal not found.', 404);
		}

		return apiSuccess(meal);
	} catch (error) {
		logger.error('API: failed to load meal', error);
		return apiError('internal_error', 'Failed to load meal.', 500);
	}
};

export const PATCH: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'meals:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiUpdateMealSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'PATCH',
			path: url.pathname,
			action: 'meals:write'
		},
		() => updateMeal(auth.userId, params.id, parsed.data),
		{ successStatus: 200, failureMessage: 'Failed to update meal' }
	);
};
