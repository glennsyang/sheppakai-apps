import { ApiWriteError } from '@sheppakai/shared/api-write';
import { eq } from 'drizzle-orm';

import type {
	WindowCleaningCustomer,
	WindowCleaningCustomerWithStats,
	WindowCleaningJob
} from '#lib/types.js';
import {
	customerRates,
	recleanDue,
	revenue,
	revenueByMonth
} from '#lib/utils/windowCleaningStats.js';

import { getDb } from '../db';
import { windowCleaningCustomerQueries, windowCleaningJobQueries } from '../db/queries';
import { windowCleaningCustomer } from '../db/schema';
import { withUpdatedAt } from '../db/utils';
import {
	createWindowCleaningJob,
	type WindowCleaningJobInput
} from '../db/writes/window-cleaning-jobs';

/**
 * The Customer module: the one place for the Customer rules — Revenue totals, the Reclean
 * Interval, Overdue Customer, and the Deleted Customer guard on writes. The `/window-cleaning`
 * page and `/api/v1/window-cleaning` both call it (#374).
 */

/** Customers show in the re-clean list once they are this close to their due date. */
const RECLEAN_LOOKAHEAD_DAYS = 14;

export type WindowCleaningCustomerInput = {
	name: string;
	address: string;
	city: string;
	unitNumber?: string;
	buzzerNumber?: string;
	phoneNumber?: string;
	email?: string;
	notes?: string;
	recleanIntervalDays?: number;
};

function sumRevenue(jobs: WindowCleaningJob[]): number {
	return jobs.reduce((sum, job) => sum + revenue(job), 0);
}

function groupByCustomer(jobs: WindowCleaningJob[]): Map<string, WindowCleaningJob[]> {
	const byCustomer = new Map<string, WindowCleaningJob[]>();
	for (const job of jobs) {
		const list = byCustomer.get(job.customerId);
		if (list) list.push(job);
		else byCustomer.set(job.customerId, [job]);
	}
	return byCustomer;
}

function withStatus(
	customer: WindowCleaningCustomer,
	jobs: WindowCleaningJob[],
	today: string
): WindowCleaningCustomerWithStats {
	const { hourlyRate, tipPct } = customerRates(jobs);
	const reclean = recleanDue(
		jobs.map((j) => j.jobDate),
		customer.recleanIntervalDays,
		today
	);
	const lastJobDate = jobs.reduce<string | null>(
		(latest, j) => (latest === null || j.jobDate > latest ? j.jobDate : latest),
		null
	);
	return {
		...customer,
		jobs,
		totalEarned: sumRevenue(jobs),
		lastJobDate,
		hourlyRate,
		tipPct,
		reclean,
		overdue: reclean !== null && reclean.overdueDays > 0
	};
}

/**
 * Every active Customer with their Jobs, Revenue, rates and Reclean status as of `today`
 * (`YYYY-MM-DD`). `jobs` is every Job, Deleted Customers' included, for Revenue totals.
 */
export async function listWithStatus(
	today: string
): Promise<{ customers: WindowCleaningCustomerWithStats[]; jobs: WindowCleaningJob[] }> {
	const [customers, jobs] = await Promise.all([
		windowCleaningCustomerQueries.findAll(),
		windowCleaningJobQueries.findAll()
	]);
	const jobsByCustomer = groupByCustomer(jobs);
	return {
		customers: customers.map((c) => withStatus(c, jobsByCustomer.get(c.id) ?? [], today)),
		jobs
	};
}

/** Customers due for a re-clean within the lookahead window, most overdue first. */
export function dueCustomers(
	customers: WindowCleaningCustomerWithStats[]
): WindowCleaningCustomerWithStats[] {
	return customers
		.filter((c) => c.reclean && c.reclean.overdueDays >= -RECLEAN_LOOKAHEAD_DAYS)
		.toSorted((a, b) => (b.reclean?.overdueDays ?? 0) - (a.reclean?.overdueDays ?? 0));
}

/** Revenue for the month and year of `today` (`YYYY-MM-DD`), and for last year. */
export function revenueSummary(jobs: WindowCleaningJob[], today: string) {
	const year = Number(today.slice(0, 4));
	const monthPrefix = today.slice(0, 7);

	const jobsThisMonth = jobs.filter((j) => j.jobDate.startsWith(monthPrefix));
	const jobsThisYear = jobs.filter((j) => j.jobDate.startsWith(String(year)));
	const jobsLastYear = jobs.filter((j) => j.jobDate.startsWith(String(year - 1)));
	const ratesThisYear = customerRates(jobsThisYear);

	return {
		currentYear: year,
		jobsThisMonthCount: jobsThisMonth.length,
		earnedThisMonth: sumRevenue(jobsThisMonth),
		earnedThisYear: sumRevenue(jobsThisYear),
		earnedLastYear: sumRevenue(jobsLastYear),
		hourlyRateThisYear: ratesThisYear.hourlyRate,
		tipPctThisYear: ratesThisYear.tipPct,
		revenueByMonth: revenueByMonth(jobsThisYear, year)
	};
}

/**
 * Refuses a write to a missing or Deleted Customer. The same `ApiWriteError` reaches the API
 * (through `handleApiWrite`) and the form banner (through `runWrite`).
 */
async function assertActiveCustomer(id: string): Promise<void> {
	const row = await getDb().query.windowCleaningCustomer.findFirst({
		where: eq(windowCleaningCustomer.id, id),
		columns: { id: true, deletedAt: true }
	});
	if (!row) throw new ApiWriteError('not_found', 'Customer not found.', 404);
	if (row.deletedAt) throw new ApiWriteError('not_found', 'This customer has been deleted.', 404);
}

function toCustomerRow(input: WindowCleaningCustomerInput) {
	return {
		name: input.name,
		address: input.address,
		city: input.city,
		unitNumber: input.unitNumber || null,
		buzzerNumber: input.buzzerNumber || null,
		phoneNumber: input.phoneNumber || null,
		email: input.email || null,
		notes: input.notes || null,
		recleanIntervalDays: input.recleanIntervalDays ?? null
	};
}

async function refetch(id: string, after: string): Promise<WindowCleaningCustomer> {
	const customer = await windowCleaningCustomerQueries.findById(id);
	if (!customer) {
		throw new Error(`Failed to re-fetch window cleaning customer ${id} after ${after}`);
	}
	return customer;
}

export async function create(
	input: WindowCleaningCustomerInput,
	userId: string
): Promise<WindowCleaningCustomer> {
	const [inserted] = await getDb()
		.insert(windowCleaningCustomer)
		.values({ ...toCustomerRow(input), userId })
		.returning();
	return refetch(inserted.id, 'creation');
}

export async function update(
	id: string,
	input: WindowCleaningCustomerInput
): Promise<WindowCleaningCustomer> {
	await assertActiveCustomer(id);
	await getDb()
		.update(windowCleaningCustomer)
		.set(withUpdatedAt(toCustomerRow(input)))
		.where(eq(windowCleaningCustomer.id, id));
	return refetch(id, 'update');
}

/** Makes the Customer a Deleted Customer: kept on record, gone from the everyday list. */
export async function softDelete(id: string, userId: string): Promise<void> {
	await assertActiveCustomer(id);
	const now = new Date();
	await getDb()
		.update(windowCleaningCustomer)
		.set(withUpdatedAt({ deletedAt: now, deletedBy: userId }, now))
		.where(eq(windowCleaningCustomer.id, id));
}

/** Clears the soft-delete markers on a Deleted Customer (admin use). */
export async function restore(id: string): Promise<void> {
	await getDb()
		.update(windowCleaningCustomer)
		.set(withUpdatedAt({ deletedAt: null, deletedBy: null }))
		.where(eq(windowCleaningCustomer.id, id));
}

/** Records a new Job for an active Customer. */
export async function addJob(
	input: WindowCleaningJobInput,
	userId: string
): Promise<WindowCleaningJob> {
	await assertActiveCustomer(input.customerId);
	return createWindowCleaningJob(input, userId);
}
