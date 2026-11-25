import { parseJsonBody, parseQuery } from '@sheppakai/shared/api-write';

import { familyWorshipApiError } from '#lib/server/api/family-worship.js';
import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import {
	apiCreateSessionSchema,
	apiSessionListQuerySchema
} from '#lib/server/api/schemas/family-worship.js';
import { getDb } from '#lib/server/db/index.js';
import { getSession, listSessions, logSession } from '#lib/server/family-worship/family-worship.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

/** Sessions newest first, optionally one topic's. */
export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'family-worship:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiSessionListQuerySchema);
	if (!parsed.ok) return parsed.response;

	try {
		return apiSuccess(listSessions(getDb(), auth.userId, parsed.data));
	} catch (error) {
		logger.error('API: failed to list family worship sessions', error);
		return apiError('internal_error', 'Failed to load sessions.', 500);
	}
};

/** Logs a session. Rule violations come back as 409 `conflict` with an `error.reason`. */
export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'family-worship:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiCreateSessionSchema);
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
			const db = getDb();
			const { note, ...input } = parsed.data;
			const result = logSession(db, auth.userId, { ...input, note: note || null });
			if (!result.ok) throw familyWorshipApiError(result, 'session');
			return getSession(db, auth.userId, result.sessionId);
		},
		{ successStatus: 201, failureMessage: 'Failed to log session' }
	);
};
