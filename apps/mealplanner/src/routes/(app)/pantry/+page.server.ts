import { addPantryItemSchema, removePantryItemSchema } from '$lib/schemas/pantry';
import { requireAuth } from '$lib/server/actions/auth-guard';
import { handleDomainAction } from '$lib/server/actions/domain-action';
import { invalidForm } from '$lib/server/actions/form-responses';
import { logger } from '$lib/server/logger';
import { listPantryItems, addPantryItem, removePantryItem } from '$lib/server/services/pantry';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const addForm = await superValidate(zod4(addPantryItemSchema));

	try {
		const items = await listPantryItems();
		return { items, addForm };
	} catch (error) {
		logger.error('Failed to load pantry items:', error);
		return {
			items: [],
			loadError: 'Failed to load your pantry. Please try refreshing the page.',
			addForm
		};
	}
};

export const actions: Actions = {
	add: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(addPantryItemSchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(
			form,
			() => addPantryItem(user.id, form.data.name, form.data.quantity, form.data.unit),
			{
				loggerContext: 'Failed to add pantry item',
				fallbackMessage: 'Could not add that item. Please try again.',
				successMessage: `Added ${form.data.name} to the pantry.`,
				logFields: { userId: user.id }
			}
		);
	}),

	remove: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(removePantryItemSchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(form, () => removePantryItem(form.data.id), {
			loggerContext: 'Failed to remove pantry item',
			fallbackMessage: 'Could not remove that item. Please try again.',
			successMessage: 'Removed from the pantry.',
			logFields: { userId: user.id }
		});
	})
};
