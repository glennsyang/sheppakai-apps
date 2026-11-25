import { ApiWriteError } from '@sheppakai/shared/api-write';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; deletedAt: Date | null } | undefined;
type Job = {
	id: string;
	customerId: string;
	jobDate: string;
	amountCharged: number;
	tip: number;
	durationHours: number | null;
};
type Customer = { id: string; name: string; recleanIntervalDays: number | null };

const mocks = vi.hoisted(() => {
	const updateWhere = vi.fn<() => Promise<void>>(async () => undefined);
	const updateSet = vi.fn<(values: Record<string, unknown>) => { where: typeof updateWhere }>(
		() => ({ where: updateWhere })
	);
	const insertReturning = vi.fn<() => Promise<{ id: string }[]>>(async () => [{ id: 'cust-1' }]);
	const insertValues = vi.fn<
		(values: Record<string, unknown>) => { returning: typeof insertReturning }
	>(() => ({ returning: insertReturning }));
	return {
		updateWhere,
		updateSet,
		update: vi.fn<() => { set: typeof updateSet }>(() => ({ set: updateSet })),
		insertReturning,
		insertValues,
		insert: vi.fn<() => { values: typeof insertValues }>(() => ({ values: insertValues })),
		findRow: vi.fn<() => Promise<Row>>(async () => ({ id: 'cust-1', deletedAt: null })),
		findById: vi.fn<(id: string) => Promise<Customer | undefined>>(async (id) => ({
			id,
			name: 'Jane Doe',
			recleanIntervalDays: null
		})),
		findAllCustomers: vi.fn<() => Promise<Customer[]>>(async () => []),
		findAllJobs: vi.fn<() => Promise<Job[]>>(async () => []),
		createJob: vi.fn<(input: unknown, userId: string) => Promise<{ id: string }>>(async () => ({
			id: 'job-1'
		}))
	};
});

vi.mock('../db', () => ({
	getDb: () => ({
		insert: mocks.insert,
		update: mocks.update,
		query: { windowCleaningCustomer: { findFirst: mocks.findRow } }
	})
}));
vi.mock('../db/queries', () => ({
	windowCleaningCustomerQueries: { findById: mocks.findById, findAll: mocks.findAllCustomers },
	windowCleaningJobQueries: { findAll: mocks.findAllJobs }
}));
vi.mock('../db/schema', () => ({ windowCleaningCustomer: { id: 'wcc.id' } }));
vi.mock('../db/writes/window-cleaning-jobs', () => ({ createWindowCleaningJob: mocks.createJob }));

import {
	addJob,
	create,
	dueCustomers,
	listWithStatus,
	restore,
	revenueSummary,
	softDelete,
	update
} from './customers';

const input = { name: 'Jane Doe', address: '123 Main St', city: 'Vancouver' };
const jobInput = { customerId: 'cust-1', jobDate: '2026-11-01', amountCharged: 100 };

function job(customerId: string, jobDate: string, amountCharged = 100, tip = 0): Job {
	return {
		id: `${customerId}-${jobDate}`,
		customerId,
		jobDate,
		amountCharged,
		tip,
		durationHours: 2
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findRow.mockResolvedValue({ id: 'cust-1', deletedAt: null });
});

describe('listWithStatus', () => {
	it('adds Revenue, last Job date and Overdue Customer status per customer', async () => {
		mocks.findAllCustomers.mockResolvedValueOnce([
			{ id: 'a', name: 'Overdue', recleanIntervalDays: 30 },
			{ id: 'b', name: 'Not yet due', recleanIntervalDays: 90 },
			{ id: 'c', name: 'No jobs', recleanIntervalDays: null }
		]);
		mocks.findAllJobs.mockResolvedValueOnce([
			job('a', '2026-09-01', 100, 20),
			job('a', '2026-10-01', 100, 0),
			job('b', '2026-11-01', 80, 5),
			job('deleted', '2026-11-02', 50, 0)
		]);

		const { customers, jobs } = await listWithStatus('2026-11-24');
		const [a, b, c] = customers;

		expect(a.totalEarned).toBe(220);
		expect(a.lastJobDate).toBe('2026-10-01');
		expect(a.overdue).toBe(true);
		expect(a.jobs).toHaveLength(2);
		expect(b.totalEarned).toBe(85);
		expect(b.overdue).toBe(false);
		expect(c.reclean).toBeNull();
		expect(c.overdue).toBe(false);
		expect(c.lastJobDate).toBeNull();
		// Deleted Customers' Jobs still count towards Revenue totals
		expect(jobs).toHaveLength(4);
	});
});

describe('dueCustomers', () => {
	it('keeps customers within 14 days of due, most overdue first', () => {
		const withReclean = (id: string, overdueDays: number | null) =>
			({
				id,
				reclean: overdueDays === null ? null : { intervalDays: 30, dueDate: '', overdueDays }
			}) as never;

		const due = dueCustomers([
			withReclean('soon', -10),
			withReclean('far', -20),
			withReclean('late', 5),
			withReclean('none', null)
		]);

		expect(due.map((c: { id: string }) => c.id)).toEqual(['late', 'soon']);
	});
});

describe('revenueSummary', () => {
	it('totals Revenue for this month, this year and last year', () => {
		const jobs = [
			job('a', '2026-11-03 10:00:00', 100, 10),
			job('a', '2026-02-01 10:00:00', 50, 0),
			job('a', '2025-06-01 10:00:00', 70, 5)
		] as never;

		const summary = revenueSummary(jobs, '2026-11-24');

		expect(summary.currentYear).toBe(2026);
		expect(summary.jobsThisMonthCount).toBe(1);
		expect(summary.earnedThisMonth).toBe(110);
		expect(summary.earnedThisYear).toBe(160);
		expect(summary.earnedLastYear).toBe(75);
		expect(summary.revenueByMonth[10]).toEqual({ month: 'November', earned: 110 });
	});
});

describe('Deleted Customer guard', () => {
	const deleted = new ApiWriteError('not_found', 'This customer has been deleted.', 404);
	const missing = new ApiWriteError('not_found', 'Customer not found.', 404);

	it.each([
		['update', () => update('cust-1', input)],
		['softDelete', () => softDelete('cust-1', 'user-1')],
		['addJob', () => addJob(jobInput, 'user-1')]
	])('%s refuses a Deleted Customer and writes nothing', async (_name, write) => {
		mocks.findRow.mockResolvedValueOnce({ id: 'cust-1', deletedAt: new Date() });

		await expect(write()).rejects.toEqual(deleted);
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.createJob).not.toHaveBeenCalled();
	});

	it.each([
		['update', () => update('cust-1', input)],
		['softDelete', () => softDelete('cust-1', 'user-1')],
		['addJob', () => addJob(jobInput, 'user-1')]
	])('%s refuses a missing customer', async (_name, write) => {
		mocks.findRow.mockResolvedValueOnce(undefined);

		await expect(write()).rejects.toEqual(missing);
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.createJob).not.toHaveBeenCalled();
	});
});

describe('writes to an active customer', () => {
	it('create inserts without audit fields and re-fetches', async () => {
		const result = await create(input, 'user-1');

		const values = mocks.insertValues.mock.calls[0][0];
		expect(values.userId).toBe('user-1');
		expect(values).not.toHaveProperty('createdBy');
		expect(values.unitNumber).toBeNull();
		expect(result).toMatchObject({ id: 'cust-1' });
	});

	it('update sets the fields with updatedAt and re-fetches', async () => {
		const result = await update('cust-1', input);

		const values = mocks.updateSet.mock.calls[0][0];
		expect(values.name).toBe('Jane Doe');
		expect(values.updatedAt).toBeInstanceOf(Date);
		expect(result).toMatchObject({ id: 'cust-1' });
	});

	it('softDelete stamps deletedAt and deletedBy', async () => {
		await softDelete('cust-1', 'user-1');

		const values = mocks.updateSet.mock.calls[0][0];
		expect(values.deletedAt).toBeInstanceOf(Date);
		expect(values.deletedBy).toBe('user-1');
		expect(values.updatedAt).toEqual(values.deletedAt);
	});

	it('restore clears the soft-delete markers', async () => {
		await restore('cust-1');

		const values = mocks.updateSet.mock.calls[0][0];
		expect(values.deletedAt).toBeNull();
		expect(values.deletedBy).toBeNull();
		expect(mocks.updateWhere).toHaveBeenCalled();
	});

	it('addJob creates the Job', async () => {
		await addJob(jobInput, 'user-1');

		expect(mocks.createJob).toHaveBeenCalledWith(jobInput, 'user-1');
	});
});
