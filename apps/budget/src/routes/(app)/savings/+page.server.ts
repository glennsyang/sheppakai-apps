import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { savingsAccountSchema } from '#lib/formSchemas/index.js';
import { createCrudActions } from '#lib/server/actions/crud-helpers.js';
import { savingsAccountQueries } from '#lib/server/db/queries/index.js';
import { savingsAccount } from '#lib/server/db/schema/index.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const form = await superValidate(zod4(savingsAccountSchema));

	try {
		const savingsAccounts = await savingsAccountQueries.findAll();

		return {
			savingsAccounts,
			form
		};
	} catch (error) {
		logger.error('Failed to load savings accounts:', error);
		return {
			savingsAccounts: [],
			loadError: 'Failed to load savings accounts. Please try refreshing the page.',
			form
		};
	}
};

export const actions = createCrudActions({
	schema: savingsAccountSchema,
	table: savingsAccount,
	entityName: 'Savings account',
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
