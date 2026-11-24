// `/api/v1/journal` adapter over the Journal Entry module: maps a miss onto an `ApiWriteError`.
import { ApiWriteError } from '@sheppakai/shared/api-write';

import type {
	ApiCreateJournalInput,
	ApiUpdateJournalInput
} from '#lib/server/api/schemas/journal.js';
import { getDb } from '#lib/server/db/index.js';
import * as journalEntry from '#lib/server/journal/journal-entry.js';

export async function createJournalEntryFromApi(userId: string, input: ApiCreateJournalInput) {
	return journalEntry.createJournalEntry(getDb(), userId, {
		date: input.date,
		content: input.content,
		location: input.location ?? null,
		weatherTemp: input.weatherTemp ?? null,
		weatherCondition: input.weatherCondition ?? null
	});
}

export async function updateJournalEntryFromApi(
	userId: string,
	entryId: string,
	input: ApiUpdateJournalInput
) {
	const updated = journalEntry.updateJournalEntry(getDb(), userId, entryId, input);
	if (!updated) throw new ApiWriteError('not_found', 'Journal entry not found.', 404);
	return updated;
}
