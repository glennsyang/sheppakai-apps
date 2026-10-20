import { redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { createRoutineSchema, MOOD_TAGS } from '#lib/schemas/meditation.js';
import { requireAuth } from '#lib/server/actions/auth-guard.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { splitCommaSeparated } from '#lib/server/actions/string-parsers.js';
import { getDb } from '#lib/server/db/index.js';
import { meditationRoutines } from '#lib/server/db/schema/index.js';
import { generateId, withTimestampsForCreate } from '#lib/server/db/utils.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const form = await superValidate(zod4(createRoutineSchema));

	return { form };
};

export const actions = {
	default: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(createRoutineSchema));

		if (!form.valid) {
			logger.warn('Invalid routine form data', { errors: form.errors });
			return invalidForm(form);
		}

		try {
			// Parse and validate mood tags
			const moodTagsArray = splitCommaSeparated(form.data.mood_tags);

			// Validate each mood tag
			const allowedTags = new Set<string>(MOOD_TAGS);
			const invalidTags = moodTagsArray.filter((tag) => !allowedTags.has(tag));
			if (invalidTags.length > 0) {
				logger.warn('Invalid mood tags provided', { invalidTags });
				return message(
					form,
					{
						type: 'error',
						text: `Invalid mood tags: ${invalidTags.join(', ')}. Allowed tags: ${MOOD_TAGS.join(', ')}`
					},
					{ status: 400 }
				);
			}

			const moodTagsJson = JSON.stringify(moodTagsArray);
			const routineId = generateId();

			await getDb()
				.insert(meditationRoutines)
				.values({
					id: routineId,
					userId: user.id,
					title: form.data.title,
					description: form.data.description || null,
					linkUrl: form.data.link_url,
					durationMinutes: form.data.duration_minutes,
					moodTags: moodTagsJson,
					isPredefined: false,
					...withTimestampsForCreate()
				});

			logger.info('Meditation routine created', { routineId, userId: user.id });
		} catch (error) {
			logger.error('Failed to create meditation routine', error);
			return message(
				form,
				{
					type: 'error',
					text: 'An error occurred while creating the routine. Please try again.'
				},
				{ status: 500 }
			);
		}

		throw redirect(303, '/meditation');
	})
} satisfies Actions;
