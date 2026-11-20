import { parseJsonBody, parseQuery } from '@sheppakai/shared/api-write';
import { and, desc, eq } from 'drizzle-orm';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import {
	apiLogSessionSchema,
	apiSessionListQuerySchema
} from '#lib/server/api/schemas/family-worship.js';
import { getDb } from '#lib/server/db/index.js';
import { familyWorshipSessions } from '#lib/server/db/schema/index.js';
import { logSession } from '#lib/server/db/writes/family-worship.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'family-worship:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiSessionListQuerySchema);
	if (!parsed.ok) return parsed.response;

	const { topicId, limit } = parsed.data;

	try {
		const conditions = [eq(familyWorshipSessions.userId, auth.userId)];
		if (topicId) conditions.push(eq(familyWorshipSessions.topicId, topicId));

		const results = await getDb().query.familyWorshipSessions.findMany({
			where: and(...conditions),
			orderBy: [desc(familyWorshipSessions.date)],
			limit
		});

		return apiSuccess(results);
	} catch (error) {
		logger.error('API: failed to list family worship sessions', error);
		return apiError('internal_error', 'Failed to load sessions.', 500);
	}
};

/** Log a week (done or skipped). Logging the same week again replaces its entry. */
export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'family-worship:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiLogSessionSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'family-worship:write'
		},
		() => logSession(auth.userId, parsed.data),
		{ successStatus: 201, failureMessage: 'Failed to log session' }
	);
};
