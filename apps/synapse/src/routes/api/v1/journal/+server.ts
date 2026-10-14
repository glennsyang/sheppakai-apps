import { parseJsonBody, parseQuery } from '@sheppakai/shared/api-write';
import { and, desc, eq, gte, like, lte } from 'drizzle-orm';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import {
	apiCreateJournalSchema,
	apiJournalListQuerySchema
} from '#lib/server/api/schemas/journal.js';
import { getDb } from '#lib/server/db/index.js';
import { journalEntries } from '#lib/server/db/schema/index.js';
import { createJournalEntry } from '#lib/server/db/writes/journal.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'journal:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiJournalListQuerySchema);
	if (!parsed.ok) return parsed.response;

	const { startDate, endDate, content, limit } = parsed.data;

	try {
		const conditions = [eq(journalEntries.userId, auth.userId)];
		if (startDate && endDate) {
			conditions.push(gte(journalEntries.date, startDate), lte(journalEntries.date, endDate));
		}
		if (content) conditions.push(like(journalEntries.content, `%${content}%`));

		const results = await getDb().query.journalEntries.findMany({
			where: and(...conditions),
			orderBy: [desc(journalEntries.date)],
			limit
		});

		return apiSuccess(results);
	} catch (error) {
		logger.error('API: failed to list journal entries', error);
		return apiError('internal_error', 'Failed to load journal entries.', 500);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'journal:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiCreateJournalSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'journal:write'
		},
		() => createJournalEntry(auth.userId, parsed.data),
		{ successStatus: 201, failureMessage: 'Failed to create journal entry' }
	);
};
