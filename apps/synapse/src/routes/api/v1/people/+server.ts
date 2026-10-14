import { parseQuery } from '@sheppakai/shared/api-write';
import { and, asc, eq } from 'drizzle-orm';

import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiPeopleListQuerySchema } from '#lib/server/api/schemas/people.js';
import { getDb } from '#lib/server/db/index.js';
import { people } from '#lib/server/db/schema/index.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'people:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiPeopleListQuerySchema);
	if (!parsed.ok) return parsed.response;

	try {
		const conditions = [eq(people.userId, auth.userId)];
		if (!parsed.data.includeArchived) {
			conditions.push(eq(people.isArchived, false));
		}

		const results = await getDb().query.people.findMany({
			where: and(...conditions),
			orderBy: [asc(people.name)],
			columns: { id: true, name: true, isArchived: true, scheduledVisitDate: true }
		});

		return apiSuccess(results);
	} catch (error) {
		logger.error('API: failed to list people', error);
		return apiError('internal_error', 'Failed to load people.', 500);
	}
};
