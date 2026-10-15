import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { restoreCustomerSchema } from '#lib/formSchemas/index.js';
import { adminFormAction } from '#lib/server/actions/admin-guard.js';
import { assertAdmin } from '#lib/server/actions/auth-guard.js';
import { windowCleaningCustomerQueries } from '#lib/server/db/queries/index.js';
import { restoreWindowCleaningCustomer } from '#lib/server/db/writes/window-cleaning-customers.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	assertAdmin(locals);

	const form = await superValidate(zod4(restoreCustomerSchema));

	try {
		const deletedCustomers = await windowCleaningCustomerQueries.findDeleted();

		return { deletedCustomers, form };
	} catch (error) {
		logger.error('Failed to load deleted customers', error);
		return {
			deletedCustomers: [],
			loadError: 'Failed to load deleted customers. Please try refreshing the page.',
			form
		};
	}
};

export const actions = {
	restore: adminFormAction(restoreCustomerSchema, async (_event, form) => {
		try {
			await restoreWindowCleaningCustomer(form.data.customerId);

			logger.info(`Customer restored: ${form.data.customerId}`);
			return message(form, { type: 'success', text: 'Customer restored successfully' });
		} catch (error) {
			logger.error('Failed to restore customer', error);
			return message(form, { type: 'error', text: 'Failed to restore customer' }, { status: 500 });
		}
	})
} satisfies Actions;
