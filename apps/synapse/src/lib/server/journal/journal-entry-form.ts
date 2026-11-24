import type { JournalEntryFormValues } from '#lib/schemas/journal.js';

import type { JournalEntryFields } from './journal-entry';

/** The journal form's values as Journal Entry fields; a blank location means "Home". */
export function toJournalEntryFields(data: JournalEntryFormValues): JournalEntryFields {
	return {
		date: data.date,
		content: data.content,
		location: data.location?.trim() || 'Home',
		weatherTemp: data.weatherTemp ?? null,
		weatherCondition: data.weatherCondition ?? null
	};
}
