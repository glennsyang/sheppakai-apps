import { idSchema } from '$lib/schemas/common';
import { buildWeatherJson, journalEntrySchema } from '$lib/schemas/journal';
import { getUser, requireAuth } from '$lib/server/actions/auth-guard';
import { invalidForm } from '$lib/server/actions/form-responses';
import { getDb } from '$lib/server/db';
import { journalEntries } from '$lib/server/db/schema';
import { withAuditFieldsForUpdate } from '$lib/server/db/utils';
import { logger } from '$lib/server/logger';
import { safeParse } from '$lib/utils/json';
import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const entry = await getDb().query.journalEntries.findFirst({
		where: and(eq(journalEntries.id, params.id), eq(journalEntries.userId, getUser(locals).id))
	});

	if (!entry) {
		throw error(404, 'Entry not found');
	}

	const weather = safeParse<{ temp?: number; condition?: string } | null>(entry.weather, null);

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
};

export const actions = {
	update: requireAuth(async ({ request, params }, user) => {
		const entryId = params.id;
		const form = await superValidate(request, zod4(journalEntrySchema));

		if (!form.valid) {
			logger.warn('Invalid journal entry form data', { errors: form.errors });
			return invalidForm(form);
		}

		try {
			const db = getDb();
			const location = form.data.location?.trim() || 'Home';

			const weather = buildWeatherJson(form.data.weatherTemp, form.data.weatherCondition);

			await db
				.update(journalEntries)
				.set({
					date: form.data.date,
					content: form.data.content,
					location,
					weather,
					...withAuditFieldsForUpdate()
				})
				.where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, user.id)));

			logger.info('Journal entry updated', { entryId, userId: user.id });
		} catch (error) {
			logger.error('Failed to update journal entry', error);
			return message(
				form,
				{ type: 'error', text: 'Failed to update journal entry' },
				{ status: 500 }
			);
		}

		throw redirect(303, '/journal');
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
		} catch (error) {
			logger.error('Failed to delete journal entry', error, { entryId });
			return message(
				form,
				{ type: 'error', text: 'Failed to delete journal entry' },
				{ status: 500 }
			);
		}

		throw redirect(303, '/journal');
	})
} satisfies Actions;
