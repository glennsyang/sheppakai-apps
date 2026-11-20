import { parseJsonBody } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError } from '#lib/server/api/response.js';
import { apiUpdateSessionSchema } from '#lib/server/api/schemas/family-worship.js';
import { deleteSession, updateSession } from '#lib/server/db/writes/family-worship.js';

import type { RequestHandler } from './$types';

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
		() => updateSession(auth.userId, params.id, parsed.data),
		{ successStatus: 200, failureMessage: 'Failed to update session' }
	);
};

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
			await deleteSession(auth.userId, params.id);
			return { id: params.id, deleted: true };
		},
		{ successStatus: 200, failureMessage: 'Failed to delete session' }
	);
};
