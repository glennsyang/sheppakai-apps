import { parseJsonBody } from '@sheppakai/shared/api-write';

import { familyWorshipApiError } from '#lib/server/api/family-worship.js';
import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError } from '#lib/server/api/response.js';
import { apiUpdateSessionSchema } from '#lib/server/api/schemas/family-worship.js';
import { getDb } from '#lib/server/db/index.js';
import { getSession, updateSession } from '#lib/server/family-worship/family-worship.js';

import type { RequestHandler } from './$types';

/** Edits a session's date, topic or note; fields left out keep their value. */
export const PATCH: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'family-worship:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiUpdateSessionSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'PATCH',
			path: url.pathname,
			action: 'family-worship:write'
		},
		async () => {
			const db = getDb();
			const existing = getSession(db, auth.userId, params.id);
			if (!existing) throw familyWorshipApiError({ reason: 'not_found' }, 'session');

			const { date, topicId, note, confirmUnskip } = parsed.data;
			const result = updateSession(db, auth.userId, existing.id, {
				date: date ?? existing.date,
				topicId: topicId ?? existing.topicId,
				note: note === undefined ? existing.note : note || null,
				confirmUnskip
			});
			if (!result.ok) throw familyWorshipApiError(result, 'session');
			return getSession(db, auth.userId, existing.id);
		},
		{ successStatus: 200, failureMessage: 'Failed to update session' }
	);
};
