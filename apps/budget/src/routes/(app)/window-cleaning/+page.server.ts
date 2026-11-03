import { eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import {
	idSchema,
	windowCleaningCustomerSchema,
	windowCleaningJobSchema
} from '#lib/formSchemas/index.js';
import { requireAuth } from '#lib/server/actions/auth-guard.js';
import { createAction, updateAction } from '#lib/server/actions/crud-helpers.js';
import { deleteJob, sendInvoice, updateJob } from '#lib/server/actions/window-cleaning-jobs.js';
import { getDb } from '#lib/server/db/index.js';
import {
	windowCleaningCustomerQueries,
	windowCleaningJobQueries
} from '#lib/server/db/queries/index.js';
import { windowCleaningCustomer, windowCleaningJob } from '#lib/server/db/schema/index.js';
import { withUpdatedAt } from '#lib/server/db/utils.js';
import { toWindowCleaningCustomerRow } from '#lib/server/db/writes/window-cleaning-customers.js';
import { toWindowCleaningJobRow } from '#lib/server/db/writes/window-cleaning-jobs.js';
import { logger } from '#lib/server/logger.js';
import type { WindowCleaningJob } from '#lib/types.js';
import { getCurrentPacificMonthYear, getPacificTodayDate } from '#lib/utils/dates.js';
import { customerRates, recleanDue, revenueByMonth } from '#lib/utils/windowCleaningStats.js';

import type { Actions, PageServerLoad } from './$types';

// Show customers in the re-clean list once they are this close to their due date
const RECLEAN_LOOKAHEAD_DAYS = 14;

export const load: PageServerLoad = async () => {
	const customerForm = await superValidate(zod4(windowCleaningCustomerSchema));
	const jobForm = await superValidate(zod4(windowCleaningJobSchema));

	try {
		const [customers, allJobs, customerStats] = await Promise.all([
			windowCleaningCustomerQueries.findAll(),
			windowCleaningJobQueries.findAll(),
			windowCleaningJobQueries.getStatsPerCustomer()
		]);

		// Build O(1) lookup maps — avoids O(customers × jobs) filter loops
		const statsMap = new Map(customerStats.map((s) => [s.customerId, s]));
		const jobsMap = allJobs.reduce((acc, job) => {
			const list = acc.get(job.customerId);
			if (list) {
				list.push(job);
			} else {
				acc.set(job.customerId, [job]);
			}
			return acc;
		}, new Map<string, WindowCleaningJob[]>());

		const today = getPacificTodayDate();
		const customersWithStats = customers.map((customer) => {
			const stats = statsMap.get(customer.id);
			const jobs = jobsMap.get(customer.id) ?? [];
			const { hourlyRate, tipPct } = customerRates(jobs);
			return {
				...customer,
				jobs,
				totalEarned: stats?.totalEarned ?? 0,
				lastJobDate: stats?.lastJobDate ?? null,
				hourlyRate,
				tipPct,
				reclean: recleanDue(
					jobs.map((j) => j.jobDate),
					customer.recleanIntervalDays,
					today
				)
			};
		});

		const dueCustomers = customersWithStats
			.filter((c) => c.reclean && c.reclean.overdueDays >= -RECLEAN_LOOKAHEAD_DAYS)
			.toSorted((a, b) => (b.reclean?.overdueDays ?? 0) - (a.reclean?.overdueDays ?? 0));

		// Page-level summary stats
		const { month: currentMonth, year: currentYear } = getCurrentPacificMonthYear();
		const monthPad = String(currentMonth).padStart(2, '0');
		const monthPrefix = `${currentYear}-${monthPad}`;

		const jobsThisMonth = allJobs.filter((j) => j.jobDate.startsWith(monthPrefix));
		const earnedThisMonth = jobsThisMonth.reduce((sum, j) => sum + j.amountCharged + j.tip, 0);

		const jobsThisYear = allJobs.filter((j) => j.jobDate.startsWith(String(currentYear)));
		const earnedThisYear = jobsThisYear.reduce((sum, j) => sum + j.amountCharged + j.tip, 0);

		const jobsLastYear = allJobs.filter((j) => j.jobDate.startsWith(String(currentYear - 1)));
		const earnedLastYear = jobsLastYear.reduce((sum, j) => sum + j.amountCharged + j.tip, 0);

		const ratesThisYear = customerRates(jobsThisYear);

		return {
			customers: customersWithStats,
			dueCustomers,
			hourlyRateThisYear: ratesThisYear.hourlyRate,
			tipPctThisYear: ratesThisYear.tipPct,
			revenueByMonth: revenueByMonth(jobsThisYear, currentYear),
			currentYear,
			totalCustomers: customers.length,
			jobsThisMonthCount: jobsThisMonth.length,
			earnedThisMonth,
			earnedThisYear,
			earnedLastYear,
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
			currentYear: getCurrentPacificMonthYear().year,
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
	createCustomer: createAction({
		schema: windowCleaningCustomerSchema,
		table: windowCleaningCustomer,
		entityName: 'Customer',
		transformCreate: (data, userId) => ({ ...toWindowCleaningCustomerRow(data), userId })
	}),

	updateCustomer: updateAction({
		schema: windowCleaningCustomerSchema,
		table: windowCleaningCustomer,
		entityName: 'Customer',
		transformUpdate: (data) => toWindowCleaningCustomerRow(data)
	}),

	// Soft-delete: set deletedAt/deletedBy instead of hard delete, so this cannot use deleteAction
	deleteCustomer: requireAuth(async (event, user) => {
		const form = await superValidate(event.request, zod4(idSchema));

		if (!form.valid) {
			return message(form, { type: 'error', text: 'Customer ID is required' }, { status: 400 });
		}

		const id = form.data.id;

		try {
			const now = new Date();
			await getDb()
				.update(windowCleaningCustomer)
				.set(withUpdatedAt({ deletedAt: now, deletedBy: user.id }, now))
				.where(eq(windowCleaningCustomer.id, id));

			logger.info(`Customer soft-deleted: ${id} by ${user.id}`);
			return message(form, { type: 'success', text: 'Customer deleted successfully' });
		} catch (error) {
			logger.error('Failed to delete customer', error);
			return message(
				form,
				{ type: 'error', text: 'Failed to delete customer. A database error occurred.' },
				{ status: 500 }
			);
		}
	}),

	createJob: createAction({
		schema: windowCleaningJobSchema,
		table: windowCleaningJob,
		entityName: 'Job',
		transformCreate: (data, userId) => ({ ...toWindowCleaningJobRow(data), userId })
	}),

	updateJob,
	sendInvoice,
	deleteJob
} satisfies Actions;
