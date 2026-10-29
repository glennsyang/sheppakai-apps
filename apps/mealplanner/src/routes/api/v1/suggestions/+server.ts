import { apiError } from '@sheppakai/shared/api-response';
import { parseJsonBody } from '@sheppakai/shared/api-write';

import { suggestMeals } from '#lib/server/ai/gemini.js';
import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiSuggestionsSchema } from '#lib/server/api/schemas/suggestions.js';
import { createUserRateLimiter } from '#lib/server/rate-limiter.js';

import type { RequestHandler } from './$types';

// Each call spends Gemini tokens, so it gets the in-app /api/suggest limit (10/min) per key,
// on top of the api-key plugin's general per-key limit.
const limiter = createUserRateLimiter([10, 'm']);

export const POST: RequestHandler = async (event) => {
	const { request, url } = event;
	const auth = await requireApiKey(request, 'suggest:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const status = await limiter.check(event, { userId: `apikey:${auth.apiKeyId}` });
	if (status.limited) {
		const response = apiError(
			'rate_limited',
			`Too many suggestion requests. Try again in ${status.retryAfter} seconds.`,
			429
		);
		response.headers.set('Retry-After', String(status.retryAfter));
		return response;
	}

	const parsed = await parseJsonBody(request, apiSuggestionsSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'suggest:write'
		},
		() => suggestMeals(parsed.data.items),
		{ successStatus: 200, failureMessage: 'Failed to generate suggestions' }
	);
};
