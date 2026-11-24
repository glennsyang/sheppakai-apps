import { error, isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { idSchema } from '#lib/schemas/common.js';
import { journalEntrySchema, storedWeatherSchema } from '#lib/schemas/journal.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import { writeAction } from '#lib/server/actions/crud-helpers.js';
import { getDb } from '#lib/server/db/index.js';
import { journalEntries } from '#lib/server/db/schema/index.js';
import { toJournalEntryFields } from '#lib/server/journal/journal-entry-form.js';
import { updateJournalEntry } from '#lib/server/journal/journal-entry.js';
import { safeParse } from '#lib/server/json.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = getUser(locals).id;

	try {
		const entry = await getDb().query.journalEntries.findFirst({
			where: and(eq(journalEntries.id, params.id), eq(journalEntries.userId, userId))
		});

		if (!entry) {
			throw error(404, 'Entry not found');
		}

		const weather = safeParse(entry.weather, storedWeatherSchema, null, 'journal.weather');

		const form = await superValidate(
			{
				date: entry.date,
				content: entry.content,
				location: entry.location || 'Home',
				weatherTemp: weather?.temp,
				weatherCondition: weather?.condition
			},
			zod4(journalEntrySchema)
		);

		return { form, entry };
	} catch (err) {
		if (isHttpError(err) || isRedirect(err)) throw err;
		logger.error('Failed to load journal entry', err, { entryId: params.id, userId });
		throw error(500, 'Failed to load journal entry');
	}
};

export const actions = {
	update: writeAction({
		schema: journalEntrySchema,
		entityName: 'Journal entry',
		verb: 'update',
		write: (data, { userId, event }) =>
			updateJournalEntry(getDb(), userId, event.params.id ?? '', toJournalEntryFields(data))?.id ??
			null,
		onSuccess: () => {
			throw redirect(303, '/journal');
		}
	}),

	delete: requireAuth(async ({ request, params }, user) => {
		const entryId = params.id;
		const form = await superValidate(request, zod4(idSchema));

		if (!form.valid || form.data.id !== entryId) {
			return message(form, { type: 'error', text: 'Invalid journal entry id' }, { status: 400 });
		}

		try {
			const existingEntry = await getDb().query.journalEntries.findFirst({
				where: and(eq(journalEntries.id, entryId), eq(journalEntries.userId, user.id))
			});

			if (!existingEntry) {
				return message(form, { type: 'error', text: 'Journal entry not found' }, { status: 404 });
			}

			await getDb()
				.delete(journalEntries)
				.where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, user.id)));

			logger.info('Journal entry deleted', { entryId, userId: user.id });
		} catch (err) {
			logger.error('Failed to delete journal entry', err, { entryId });
			return message(
				form,
				{ type: 'error', text: 'Failed to delete journal entry' },
				{ status: 500 }
			);
		}

		throw redirect(303, '/journal');
	})
} satisfies Actions;
