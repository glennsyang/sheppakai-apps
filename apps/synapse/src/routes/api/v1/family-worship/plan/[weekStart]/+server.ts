import { parseJsonBody } from '@sheppakai/shared/api-write';

import { familyWorshipApiError } from '#lib/server/api/family-worship.js';
import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError } from '#lib/server/api/response.js';
import { apiPlanWeekSchema } from '#lib/server/api/schemas/family-worship.js';
import { getDb } from '#lib/server/db/index.js';
import { clearWeek, planWeek } from '#lib/server/family-worship/family-worship.js';

import type { RequestHandler } from './$types';

/** Plans a topic for the week starting `weekStart` (a Monday), replacing any planned topic. */
export const PUT: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'family-worship:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiPlanWeekSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'PUT',
			path: url.pathname,
			action: 'family-worship:write'
		},
		async () => {
			const result = planWeek(getDb(), auth.userId, params.weekStart, parsed.data.topicId);
			if (!result.ok) throw familyWorshipApiError(result, 'plan');
			return { weekStart: params.weekStart, topicId: parsed.data.topicId };
		},
		{ successStatus: 200, failureMessage: 'Failed to plan week' }
	);
};

/** Clears the week's plan; its topic goes back to the front of the Topic Queue. */
export const DELETE: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'family-worship:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'DELETE',
			path: url.pathname,
			action: 'family-worship:write'
		},
		async () => {
			const result = clearWeek(getDb(), auth.userId, params.weekStart);
			if (!result.ok) throw familyWorshipApiError(result, 'plan');
			return { weekStart: params.weekStart, topicId: null };
		},
		{ successStatus: 200, failureMessage: 'Failed to clear week' }
	);
};
