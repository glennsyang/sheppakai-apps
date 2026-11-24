import { apiError } from '@sheppakai/shared/api-response';
import { ApiWriteError, parseJsonBody } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { toApiWeek } from '#lib/server/api/plans.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiPlanDayParamsSchema, apiSetPlanDaySchema } from '#lib/server/api/schemas/plans.js';
import {
	clearMealPlanDay,
	getMealPlanWithEntries,
	planDinner,
	RecipeNotFoundError
} from '#lib/server/services/mealPlan.js';

import type { RequestHandler } from './$types';

function parseParams(params: { week: string; day: string }) {
	const parsed = apiPlanDayParamsSchema.safeParse(params);
	if (parsed.success) return { ok: true as const, data: parsed.data };
	const message = parsed.error.issues.map((i) => i.message).join('; ');
	return { ok: false as const, response: apiError('validation_failed', message, 400) };
}

// Both writes answer with the whole updated week, the same shape GET /api/v1/plans returns.

export const PUT: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'plans:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const target = parseParams(params);
	if (!target.ok) return target.response;
	const body = await parseJsonBody(request, apiSetPlanDaySchema);
	if (!body.ok) return body.response;

	const { week, day } = target.data;
	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'PUT',
			path: url.pathname,
			action: 'plans:write'
		},
		async () => {
			try {
				const entries = await planDinner({
					userId: auth.userId,
					week,
					day,
					dinner: { recipeId: body.data.recipeId }
				});
				return toApiWeek(week, entries);
			} catch (err) {
				if (err instanceof RecipeNotFoundError) {
					throw new ApiWriteError('not_found', 'Recipe not found.', 404);
				}
				throw err;
			}
		},
		{ successStatus: 200, failureMessage: 'Failed to set planned dinner' }
	);
};

export const DELETE: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'plans:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const target = parseParams(params);
	if (!target.ok) return target.response;

	const { week, day } = target.data;
	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'DELETE',
			path: url.pathname,
			action: 'plans:write'
		},
		async () => {
			if (!(await clearMealPlanDay(week, day))) {
				throw new ApiWriteError('not_found', 'Nothing is planned for that day.', 404);
			}
			return toApiWeek(week, await getMealPlanWithEntries(week));
		},
		{ successStatus: 200, failureMessage: 'Failed to clear planned dinner' }
	);
};
