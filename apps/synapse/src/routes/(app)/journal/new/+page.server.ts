import { redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { journalEntrySchema } from '#lib/schemas/journal.js';
import { writeAction } from '#lib/server/actions/crud-helpers.js';
import { getDb } from '#lib/server/db/index.js';
import { toJournalEntryFields } from '#lib/server/journal/journal-entry-form.js';
import { createJournalEntry } from '#lib/server/journal/journal-entry.js';
import { getTodayString } from '#lib/utils/date.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const form = await superValidate(zod4(journalEntrySchema));

	// Set default date to today, use local timezone
	form.data.date = getTodayString();
	form.data.location = 'Home';

	return { form };
};

export const actions = {
	default: writeAction({
		schema: journalEntrySchema,
		entityName: 'Journal entry',
		verb: 'create',
		write: (data, { userId }) => createJournalEntry(getDb(), userId, toJournalEntryFields(data)).id,
		onSuccess: () => {
			throw redirect(303, '/journal');
		}
	})
} satisfies Actions;
