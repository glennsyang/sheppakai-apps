// Shared POST handler for the AI routes: an authenticated caller, a per-caller rate limit,
// a validated JSON body, and the `{ data }` / `{ error }` envelope from docs/API_CONVENTIONS.md.
// The caller adapter decides who may call and how the outcome is recorded:
// - `sessionCaller` — the signed-in user (`/api/suggest`, `/api/variations`).
// - `apiKeyCaller(scope)` — an API key with that scope, audited like any /api/v1 write.

import { apiError, apiSuccess } from '@sheppakai/shared/api-response';
import { parseJsonBody } from '@sheppakai/shared/api-write';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import type { ZodType } from 'zod';

import type { ApiScope } from '#lib/api-scopes.js';
import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { logger } from '#lib/server/logger.js';
import { createUserRateLimiter } from '#lib/server/rate-limiter.js';

type Respond = (
	perform: () => Promise<unknown>,
	options: { label: string; failMessage: string }
) => Promise<Response>;

type CallerResult =
	| { ok: true; rateLimitKey: string; logContext: Record<string, string>; respond: Respond }
	| { ok: false; response: Response };

export type AiCaller = (event: RequestEvent) => Promise<CallerResult>;

export const sessionCaller: AiCaller = async ({ locals }) => {
	if (!locals.user) {
		return { ok: false, response: apiError('unauthorized', 'Sign in to use this feature.', 401) };
	}
	return {
		ok: true,
		rateLimitKey: locals.user.id,
		logContext: { userId: locals.user.id },
		respond: async (perform, { label, failMessage }) => {
			try {
				return apiSuccess(await perform());
			} catch (err) {
				logger.error(`${label} error`, err);
				return apiError('internal_error', failMessage, 500);
			}
		}
	};
};

export function apiKeyCaller(scope: ApiScope): AiCaller {
	return async ({ request, url }) => {
		const auth = await requireApiKey(request, scope);
		if (!auth.ok) return { ok: false, response: apiError(auth.code, auth.message, auth.status) };
		return {
			ok: true,
			rateLimitKey: `apikey:${auth.apiKeyId}`,
			logContext: { apiKeyId: auth.apiKeyId, userId: auth.userId },
			respond: (perform, { failMessage }) =>
				handleApiWrite(
					{
						apiKeyId: auth.apiKeyId,
						userId: auth.userId,
						method: request.method,
						path: url.pathname,
						action: scope
					},
					perform,
					{ successStatus: 200, failureMessage: failMessage }
				)
		};
	};
}

interface AiEndpointOptions<T, R> {
	caller: AiCaller;
	schema: ZodType<T>;
	run: (input: T) => Promise<R>;
	/** Log prefix, e.g. 'Suggest API'. */
	label: string;
	/** User-facing 500 message. */
	failMessage: string;
}

export function createAiEndpoint<T, R>({
	caller,
	schema,
	run,
	label,
	failMessage
}: AiEndpointOptions<T, R>): RequestHandler {
	// One limiter per route, at module scope. Each call spends model tokens: 10/min per caller.
	const limiter = createUserRateLimiter([10, 'm']);

	return async (event) => {
		const identity = await caller(event);
		if (!identity.ok) return identity.response;

		const rateLimitStatus = await limiter.check(event, { userId: identity.rateLimitKey });
		if (rateLimitStatus.limited) {
			const response = apiError(
				'rate_limited',
				`Too many requests. Please try again in ${rateLimitStatus.retryAfter} seconds.`,
				429
			);
			response.headers.set('Retry-After', String(rateLimitStatus.retryAfter));
			return response;
		}

		const body = await parseJsonBody(event.request, schema);
		if (!body.ok) return body.response;

		logger.info(`${label} called`, identity.logContext);
		return identity.respond(() => run(body.data), { label, failMessage });
	};
}
