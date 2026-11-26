import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { windowCleaningCustomerSchema, windowCleaningJobSchema } from '#lib/formSchemas/index.js';
import {
	writeCreateAction,
	writeDeleteAction,
	writeUpdateAction
} from '#lib/server/actions/crud-helpers.js';
import { deleteJob, sendInvoice, updateJob } from '#lib/server/actions/window-cleaning-jobs.js';
import { logger } from '#lib/server/logger.js';
import {
	addJob,
	create,
	dueCustomers,
	listWithStatus,
	revenueSummary,
	softDelete,
	update
} from '#lib/server/window-cleaning/customers.js';
import { getCurrentAppMonthYear, getAppTodayDate } from '#lib/utils/dates.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const customerForm = await superValidate(zod4(windowCleaningCustomerSchema));
	const jobForm = await superValidate(zod4(windowCleaningJobSchema));

	try {
		const today = getAppTodayDate();
		const { customers, jobs } = await listWithStatus(today);

		return {
			customers,
			dueCustomers: dueCustomers(customers),
			totalCustomers: customers.length,
			...revenueSummary(jobs, today),
			customerForm,
			jobForm
		};
	} catch (error) {
		logger.error('Failed to load window cleaning customers:', error);
		return {
			customers: [],
			dueCustomers: [],
			hourlyRateThisYear: null,
			tipPctThisYear: null,
			revenueByMonth: [],
			currentYear: getCurrentAppMonthYear().year,
			totalCustomers: 0,
			jobsThisMonthCount: 0,
			earnedThisMonth: 0,
			earnedThisYear: 0,
			earnedLastYear: 0,
			loadError: 'Failed to load window cleaning customers. Please try refreshing the page.',
			customerForm,
			jobForm
		};
	}
};

export const actions = {
	createCustomer: writeCreateAction(
		{ schema: windowCleaningCustomerSchema, entityName: 'Customer' },
		create
	),

	updateCustomer: writeUpdateAction(
		{ schema: windowCleaningCustomerSchema, entityName: 'Customer' },
		update
	),

	// Soft delete: the Customer becomes a Deleted Customer, kept on record
	deleteCustomer: writeDeleteAction({ entityName: 'Customer' }, softDelete),

	createJob: writeCreateAction({ schema: windowCleaningJobSchema, entityName: 'Job' }, addJob),

	updateJob,
	sendInvoice,
	deleteJob
} satisfies Actions;
