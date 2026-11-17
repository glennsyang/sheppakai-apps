import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import {
	addShoppingItemSchema,
	removeShoppingItemSchema,
	toggleShoppingItemSchema
} from '#lib/schemas/shopping.js';
import { requireAuth } from '#lib/server/actions/auth-guard.js';
import { handleDomainAction } from '#lib/server/actions/domain-action.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { logger } from '#lib/server/logger.js';
import {
	addManualItem,
	removeManualItem,
	setShoppingItemChecked,
	syncShoppingList
} from '#lib/server/services/shoppingList.js';
import { resolveWeekStartDate } from '#lib/server/week.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const weekStartDate = resolveWeekStartDate(url);
	const addForm = await superValidate({ weekStartDate }, zod4(addShoppingItemSchema), {
		errors: false
	});

	try {
		const items = await syncShoppingList(locals.user?.id ?? null, weekStartDate);
		return { items, weekStartDate, addForm };
	} catch (error) {
		logger.error('Failed to load shopping list:', error);
		return {
			items: [],
			weekStartDate,
			addForm,
			loadError: 'Failed to load your shopping list. Please try refreshing the page.'
		};
	}
};

function notFound(): never {
	throw new Error('Shopping list item not found');
}

export const actions: Actions = {
	toggle: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(toggleShoppingItemSchema));
		if (!form.valid) return invalidForm(form);
		const checked = form.data.checked === 'true';

		return handleDomainAction(
			form,
			async () => {
				if (!(await setShoppingItemChecked(user.id, form.data.id, checked))) notFound();
			},
			{
				loggerContext: 'Failed to update shopping list item',
				fallbackMessage: 'Could not update that item. Please try again.',
				successMessage: checked ? 'Ticked off and added to the pantry.' : 'Back on the list.',
				logFields: { userId: user.id }
			}
		);
	}),

	addItem: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(addShoppingItemSchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(
			form,
			() =>
				addManualItem(user.id, form.data.weekStartDate, {
					name: form.data.name,
					quantity: form.data.quantity ?? null,
					unit: form.data.unit || null
				}),
			{
				loggerContext: 'Failed to add shopping list item',
				fallbackMessage: 'Could not add that item. Please try again.',
				successMessage: `Added ${form.data.name} to the list.`,
				logFields: { userId: user.id }
			}
		);
	}),

	removeItem: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(removeShoppingItemSchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(
			form,
			async () => {
				if (!(await removeManualItem(form.data.id))) notFound();
			},
			{
				loggerContext: 'Failed to remove shopping list item',
				fallbackMessage: 'Could not remove that item. Please try again.',
				successMessage: 'Removed from the list.',
				logFields: { userId: user.id }
			}
		);
	})
};
