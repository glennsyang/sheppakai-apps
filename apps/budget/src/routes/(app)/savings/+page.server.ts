import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { savingsSchema } from '#lib/formSchemas/index.js';
import { createCrudActions } from '#lib/server/actions/crud-helpers.js';
import { savingsQueries } from '#lib/server/db/queries/index.js';
import { savings } from '#lib/server/db/schema/index.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const form = await superValidate(zod4(savingsSchema));

	try {
		const allSavings = await savingsQueries.findAll();

		return {
			savings: allSavings,
			form
		};
	} catch (error) {
		logger.error('Failed to load savings:', error);
		return {
			savings: [],
			loadError: 'Failed to load savings. Please try refreshing the page.',
			form
		};
	}
};

export const actions = createCrudActions({
	schema: savingsSchema,
	table: savings,
	entityName: 'Savings',
	transformCreate: (data, userId) => ({
		title: data.title,
		description: data.description || null,
		amount: data.amount,
		userId
	}),
	transformUpdate: (data) => ({
		title: data.title,
		description: data.description || null,
		amount: data.amount
	})
}) satisfies Actions;
