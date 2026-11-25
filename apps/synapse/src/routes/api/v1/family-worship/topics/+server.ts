import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { getDb } from '#lib/server/db/index.js';
import { getTopicQueue } from '#lib/server/family-worship/family-worship.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

/** Active topics in Topic Queue order (front first). */
export const GET: RequestHandler = async ({ request }) => {
	const auth = await requireApiKey(request, 'family-worship:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	try {
		const topics = getTopicQueue(getDb(), auth.userId).map((topic) => ({
			id: topic.id,
			title: topic.title,
			description: topic.description,
			notes: topic.notes,
			scriptureReferences: topic.scriptureReferences,
			publicationLinks: topic.publicationLinks,
			queuePosition: topic.queuePosition
		}));
		return apiSuccess(topics);
	} catch (error) {
		logger.error('API: failed to list family worship topics', error);
		return apiError('internal_error', 'Failed to load topics.', 500);
	}
};
