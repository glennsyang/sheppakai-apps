import { parseJsonBody } from '@sheppakai/shared/api-write';
import { and, eq } from 'drizzle-orm';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiUpdateJournalSchema } from '#lib/server/api/schemas/journal.js';
import { getDb } from '#lib/server/db/index.js';
import { journalEntries } from '#lib/server/db/schema/index.js';
import { updateJournalEntry } from '#lib/server/db/writes/journal.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const auth = await requireApiKey(request, 'journal:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	try {
		const entry = await getDb().query.journalEntries.findFirst({
			where: and(eq(journalEntries.id, params.id), eq(journalEntries.userId, auth.userId))
		});

		if (!entry) {
			return apiError('not_found', 'Journal entry not found.', 404);
		}

		return apiSuccess(entry);
	} catch (error) {
		logger.error('API: failed to load journal entry', error);
		return apiError('internal_error', 'Failed to load journal entry.', 500);
	}
};

export const PATCH: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'journal:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiUpdateJournalSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'PATCH',
			path: url.pathname,
			action: 'journal:write'
		},
		() => updateJournalEntry(auth.userId, params.id, parsed.data),
		{ successStatus: 200, failureMessage: 'Failed to update journal entry' }
	);
};
