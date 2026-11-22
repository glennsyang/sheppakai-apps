import { message, type SuperValidated, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import {
	idSchema,
	pastAmountSchema,
	recurringBillSchema,
	togglePaidSchema
} from '#lib/formSchemas/index.js';
import { requireAuth } from '#lib/server/actions/auth-guard.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { type CrudMessages, getCrudMessage } from '#lib/server/actions/messages.js';
import { recurringBillQueries } from '#lib/server/db/queries/index.js';
import {
	createRecurringBill,
	deleteRecurringBill,
	markRecurringBillPaid,
	setRecurringBillAmountForMonth,
	updateRecurringBill
} from '#lib/server/db/writes/recurring-bills.js';
import { logger } from '#lib/server/logger.js';
import { currentMonthKey, toMonthKey } from '#lib/server/recurring-bill-history.js';
import { getMonthYearFromUrl } from '#lib/utils/dates.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const form = await superValidate(zod4(recurringBillSchema));
	const { month, year } = getMonthYearFromUrl(url);
	const monthKey = toMonthKey(month, year);
	// Only the current month is editable; other months are a read-only view of history (#240).
	const thisMonth = currentMonthKey();
	const isCurrentMonth = monthKey === thisMonth;
	// Past months allow a one-month amount correction; future months are view-only.
	const isPastMonth = monthKey < thisMonth;

	try {
		const recurringBills = await recurringBillQueries.findForMonth(monthKey);

		return { recurringBills, form, isCurrentMonth, isPastMonth, monthKey };
	} catch (error) {
		logger.error('Failed to load recurring bills:', error);
		return {
			recurringBills: [],
			isCurrentMonth,
			isPastMonth,
			monthKey,
			loadError: 'Failed to load recurring bills. Please try refreshing the page.',
			form
		};
	}
};

const ENTITY = 'Recurring bill';

function crudError<T extends Record<string, unknown>>(
	form: SuperValidated<T>,
	key: keyof CrudMessages
) {
	return message(form, { type: 'error', text: getCrudMessage(key, ENTITY) }, { status: 500 });
}

function crudSuccess<T extends Record<string, unknown>>(
	form: SuperValidated<T>,
	key: keyof CrudMessages
) {
	return message(form, { type: 'success', text: getCrudMessage(key, ENTITY) });
}

// Hand-rolled instead of `createCrudActions`: each write also maintains the bill's price
// history (#240), so it goes through `writes/recurring-bills.ts` rather than a plain table write.
export const actions = {
	create: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(recurringBillSchema));
		if (!form.valid) return invalidForm(form);

		try {
			createRecurringBill(form.data, user.id);
			logger.info(`${ENTITY} created successfully`);
		} catch (error) {
			logger.error('Failed to create recurring bill', error);
			return crudError(form, 'createError');
		}
		return crudSuccess(form, 'createSuccess');
	}),
	update: requireAuth(async ({ request }) => {
		const form = await superValidate(request, zod4(recurringBillSchema));
		if (!form.valid) return invalidForm(form);
		if (!form.data.id) return invalidForm(form, 'ID is required for update');

		try {
			const updated = updateRecurringBill(form.data.id, form.data);
			if (!updated) {
				return message(form, { type: 'error', text: 'Recurring bill not found.' }, { status: 404 });
			}
			logger.info(`${ENTITY} updated successfully`, { id: form.data.id });
		} catch (error) {
			logger.error('Failed to update recurring bill', error);
			return crudError(form, 'updateError');
		}
		return crudSuccess(form, 'updateSuccess');
	}),
	delete: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(idSchema));
		if (!form.valid) return invalidForm(form);

		try {
			deleteRecurringBill(form.data.id);
			logger.info(`${ENTITY} deleted successfully by:`, { userId: user.id });
		} catch (error) {
			logger.error('Failed to delete recurring bill', error);
			return crudError(form, 'deleteError');
		}
		return crudSuccess(form, 'deleteSuccess');
	}),
	setPastAmount: requireAuth(async ({ request }) => {
		const form = await superValidate(request, zod4(pastAmountSchema));
		if (!form.valid) return invalidForm(form);

		try {
			const result = setRecurringBillAmountForMonth(
				form.data.id,
				form.data.month,
				form.data.amount
			);
			if (result === 'not-past') {
				return invalidForm(form, 'Only past months can be corrected here.');
			}
			if (result === 'not-found') {
				return message(
					form,
					{ type: 'error', text: 'That bill was not in effect that month.' },
					{ status: 404 }
				);
			}
			logger.info(`${ENTITY} amount corrected for a past month`, {
				id: form.data.id,
				month: form.data.month
			});
		} catch (error) {
			logger.error('Failed to correct a recurring bill price for a past month', error);
			return crudError(form, 'updateError');
		}
		return message(form, { type: 'success', text: 'Amount updated for that month' });
	}),
	togglePaid: requireAuth(async ({ request }) => {
		const form = await superValidate(request, zod4(togglePaidSchema));

		if (!form.valid) {
			return invalidForm(form);
		}

		try {
			await markRecurringBillPaid(form.data.id, form.data.paid);
			logger.info(`Toggled paid status for recurring bill ${form.data.id} to ${form.data.paid}`);
			return message(form, { type: 'success', text: 'Paid status updated' });
		} catch (error) {
			logger.error('Failed to toggle bill payment', error);
			return message(
				form,
				{ type: 'error', text: 'Failed to toggle paid status. Please try again.' },
				{ status: 500 }
			);
		}
	})
} satisfies Actions;
