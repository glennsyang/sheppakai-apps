import { apiError, apiSuccess } from '@sheppakai/shared/api-response';
import { ApiWriteError, parseJsonBody } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiUpdatePantryItemSchema } from '#lib/server/api/schemas/pantry.js';
import { logger } from '#lib/server/logger.js';
import { getPantryItem, removePantryItem, updatePantryItem } from '#lib/server/services/pantry.js';

import type { RequestHandler } from './$types';

const notFound = () => new ApiWriteError('not_found', 'Pantry item not found.', 404);

export const GET: RequestHandler = async ({ request, params }) => {
	const auth = await requireApiKey(request, 'pantry:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	try {
		const item = await getPantryItem(params.id);
		if (!item) return apiError('not_found', 'Pantry item not found.', 404);
		return apiSuccess(item);
	} catch (error) {
		logger.error('API: failed to load pantry item', error);
		return apiError('internal_error', 'Failed to load pantry item.', 500);
	}
};

export const PATCH: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'pantry:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiUpdatePantryItemSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'PATCH',
			path: url.pathname,
			action: 'pantry:write'
		},
		async () => {
			const item = await updatePantryItem(params.id, parsed.data);
			if (!item) throw notFound();
			return item;
		},
		{ successStatus: 200, failureMessage: 'Failed to update pantry item' }
	);
};

export const DELETE: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'pantry:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'DELETE',
			path: url.pathname,
			action: 'pantry:write'
		},
		async () => {
			if (!(await removePantryItem(params.id))) throw notFound();
			return { id: params.id };
		},
		{ successStatus: 200, failureMessage: 'Failed to delete pantry item' }
	);
};
