import { eq } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import { windowCleaningJobQueries } from '#lib/server/db/queries/index.js';
import { windowCleaningJob } from '#lib/server/db/schema/index.js';
import { withUpdatedAt } from '#lib/server/db/utils.js';
import type { WindowCleaningJob } from '#lib/types.js';
import { formatDateForStorage } from '#lib/utils/dates.js';

export type WindowCleaningJobInput = {
	customerId: string;
	jobDate: string;
	jobTime?: string;
	amountCharged: number;
	tip?: number;
	durationHours?: number;
	notes?: string;
};

/**
 * The single write path for Jobs: the `/window-cleaning` form actions and
 * `/api/v1/window-cleaning/jobs` (#373).
 */

function toWindowCleaningJobRow(input: WindowCleaningJobInput) {
	return {
		customerId: input.customerId,
		jobDate: formatDateForStorage(input.jobDate),
		jobTime: input.jobTime || null,
		amountCharged: input.amountCharged,
		tip: input.tip ?? 0,
		durationHours: input.durationHours ?? null,
		notes: input.notes || null
	};
}

export async function createWindowCleaningJob(
	input: WindowCleaningJobInput,
	userId: string
): Promise<WindowCleaningJob> {
	const [inserted] = await getDb()
		.insert(windowCleaningJob)
		.values({ ...toWindowCleaningJobRow(input), userId })
		.returning();

	const withRelations = await windowCleaningJobQueries.findById(inserted.id);
	if (!withRelations) {
		throw new Error(`Failed to re-fetch window cleaning job ${inserted.id} after creation`);
	}
	return withRelations;
}

export async function updateWindowCleaningJob(
	id: string,
	input: WindowCleaningJobInput
): Promise<void> {
	await getDb()
		.update(windowCleaningJob)
		.set(withUpdatedAt(toWindowCleaningJobRow(input)))
		.where(eq(windowCleaningJob.id, id));
}

export async function deleteWindowCleaningJob(id: string): Promise<void> {
	await getDb().delete(windowCleaningJob).where(eq(windowCleaningJob.id, id));
}

/** Records when the job's invoice email went out. */
export async function markWindowCleaningJobInvoiced(id: string, sentAt: Date): Promise<void> {
	await getDb()
		.update(windowCleaningJob)
		.set(withUpdatedAt({ invoiceSentAt: sentAt }, sentAt))
		.where(eq(windowCleaningJob.id, id));
}
