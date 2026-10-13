import { parseJsonBody } from '@sheppakai/shared/api-write';
import { and, eq } from 'drizzle-orm';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiUpdateVisitSchema } from '#lib/server/api/schemas/visits.js';
import { getDb } from '#lib/server/db/index.js';
import { visits } from '#lib/server/db/schema/index.js';
import { updateVisit } from '#lib/server/db/writes/visits.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const auth = await requireApiKey(request, 'visits:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	try {
		const visit = await getDb().query.visits.findFirst({
			where: and(eq(visits.id, params.id), eq(visits.userId, auth.userId))
		});

		if (!visit) {
			return apiError('not_found', 'Visit not found.', 404);
		}

		return apiSuccess(visit);
	} catch (error) {
		logger.error('API: failed to load visit', error);
		return apiError('internal_error', 'Failed to load visit.', 500);
	}
};

export const PATCH: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'visits:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiUpdateVisitSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'PATCH',
			path: url.pathname,
			action: 'visits:write'
		},
		() => updateVisit(auth.userId, params.id, parsed.data),
		{ successStatus: 200, failureMessage: 'Failed to update visit' }
	);
};
