import { apiError, apiSuccess } from '@sheppakai/shared/api-response';
import { parseJsonBody } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiCreatePantryItemSchema } from '#lib/server/api/schemas/pantry.js';
import { logger } from '#lib/server/logger.js';
import { addPantryItem, listPantryItems } from '#lib/server/services/pantry.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const auth = await requireApiKey(request, 'pantry:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	try {
		return apiSuccess(await listPantryItems());
	} catch (error) {
		logger.error('API: failed to list pantry items', error);
		return apiError('internal_error', 'Failed to load pantry items.', 500);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'pantry:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiCreatePantryItemSchema);
	if (!parsed.ok) return parsed.response;

	const { name, quantity, unit } = parsed.data;
	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'pantry:write'
		},
		() => addPantryItem(auth.userId, name, quantity, unit),
		{ successStatus: 201, failureMessage: 'Failed to add pantry item' }
	);
};
