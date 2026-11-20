import { parseQuery } from '@sheppakai/shared/api-write';

import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiTopicListQuerySchema } from '#lib/server/api/schemas/family-worship.js';
import { getDb } from '#lib/server/db/index.js';
import { loadFamilyWorship } from '#lib/server/family-worship.js';
import { logger } from '#lib/server/logger.js';
import { getTodayString } from '#lib/utils/date.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'family-worship:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiTopicListQuerySchema);
	if (!parsed.ok) return parsed.response;

	try {
		const { topics } = await loadFamilyWorship(getDb(), auth.userId, getTodayString(), 1);
		return apiSuccess(
			parsed.data.includeArchived ? topics : topics.filter((topic) => !topic.isArchived)
		);
	} catch (error) {
		logger.error('API: failed to list family worship topics', error);
		return apiError('internal_error', 'Failed to load topics.', 500);
	}
};
