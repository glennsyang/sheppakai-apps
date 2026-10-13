import { redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { personSchema } from '#lib/schemas/visits.js';
import { requireAuth } from '#lib/server/actions/auth-guard.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { getDb } from '#lib/server/db/index.js';
import { people } from '#lib/server/db/schema/index.js';
import { generateId, withTimestampsForCreate } from '#lib/server/db/utils.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const form = await superValidate(zod4(personSchema));
	return { form };
};

export const actions = {
	default: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(personSchema));

		if (!form.valid) {
			logger.warn('Invalid person form data', { errors: form.errors });
			return invalidForm(form);
		}

		try {
			const personId = generateId();

			await getDb()
				.insert(people)
				.values({
					id: personId,
					userId: user.id,
					name: form.data.name,
					isExempt: false,
					isArchived: false,
					...withTimestampsForCreate()
				});

			logger.info('Person created', { personId, userId: user.id });
		} catch (error) {
			logger.error('Failed to create person', error);
			return message(
				form,
				{
					type: 'error',
					text: 'An error occurred while adding the person. Please try again.'
				},
				{ status: 500 }
			);
		}

		throw redirect(303, '/visits');
	})
} satisfies Actions;
