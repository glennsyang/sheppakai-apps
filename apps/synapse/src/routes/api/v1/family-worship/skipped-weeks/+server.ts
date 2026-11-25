import { parseJsonBody } from '@sheppakai/shared/api-write';

import { familyWorshipApiError } from '#lib/server/api/family-worship.js';
import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError } from '#lib/server/api/response.js';
import { apiSkipWeekSchema } from '#lib/server/api/schemas/family-worship.js';
import { getDb } from '#lib/server/db/index.js';
import { skipWeek } from '#lib/server/family-worship/family-worship.js';

import type { RequestHandler } from './$types';

/** Marks a week as a Skipped Week (or updates its reason). Its planned topic returns to the queue. */
export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'family-worship:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiSkipWeekSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'family-worship:write'
		},
		async () => {
			const { weekStart, reason } = parsed.data;
			const result = skipWeek(getDb(), auth.userId, weekStart, reason || null);
			if (!result.ok) throw familyWorshipApiError(result, 'skip');
			return { weekStart, reason: reason || null };
		},
		{ successStatus: 201, failureMessage: 'Failed to skip week' }
	);
};
