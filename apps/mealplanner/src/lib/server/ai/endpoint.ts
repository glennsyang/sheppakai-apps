// Shared POST handler for the in-app AI routes (`/api/suggest`, `/api/variations`): signed-in
// user, per-user rate limit, validated JSON body, and the `{ data }` / `{ error }` envelope
// from docs/API_CONVENTIONS.md.

import { apiError, apiSuccess } from '@sheppakai/shared/api-response';
import { parseJsonBody } from '@sheppakai/shared/api-write';
import type { RequestHandler } from '@sveltejs/kit';
import type { ZodType } from 'zod';

import { logger } from '#lib/server/logger.js';
import { createUserRateLimiter } from '#lib/server/rate-limiter.js';

interface AiEndpointOptions<T, R> {
	schema: ZodType<T>;
	run: (input: T) => Promise<R>;
	/** Log prefix, e.g. 'Suggest API'. */
	label: string;
	/** User-facing 500 message. */
	failMessage: string;
}

export function createAiEndpoint<T, R>({
	schema,
	run,
	label,
	failMessage
}: AiEndpointOptions<T, R>): RequestHandler {
	// One limiter per route, at module scope.
	const limiter = createUserRateLimiter([10, 'm']);

	return async (event) => {
		const { request, locals } = event;

		if (!locals.user) {
			return apiError('unauthorized', 'Sign in to use this feature.', 401);
		}

		const rateLimitStatus = await limiter.check(event, { userId: locals.user.id });
		if (rateLimitStatus.limited) {
			const response = apiError(
				'rate_limited',
				`Too many requests. Please try again in ${rateLimitStatus.retryAfter} seconds.`,
				429
			);
			response.headers.set('Retry-After', String(rateLimitStatus.retryAfter));
			return response;
		}

		const body = await parseJsonBody(request, schema);
		if (!body.ok) return body.response;

		logger.info(`${label} called`, { userId: locals.user.id });

		try {
			return apiSuccess(await run(body.data));
		} catch (err) {
			logger.error(`${label} error`, err);
			return apiError('internal_error', failMessage, 500);
		}
	};
}
