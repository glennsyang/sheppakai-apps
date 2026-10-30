import { eq } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import { windowCleaningJobQueries } from '#lib/server/db/queries/index.js';
import { windowCleaningJob } from '#lib/server/db/schema/index.js';
import { withUpdatedAt } from '#lib/server/db/utils.js';
import type { WindowCleaningJob } from '#lib/types.js';
import { formatDateForStorage } from '#lib/utils/dates.js';

export type CreateWindowCleaningJobInput = {
	customerId: string;
	jobDate: string;
	jobTime?: string;
	amountCharged: number;
	tip?: number;
	durationHours?: number;
	notes?: string;
};

/** Input → row mapping shared by the UI form actions and the API write path. */
export function toWindowCleaningJobRow(input: CreateWindowCleaningJobInput) {
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
	input: CreateWindowCleaningJobInput,
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

/** Records when the job's invoice email went out. */
export async function markWindowCleaningJobInvoiced(id: string, sentAt: Date): Promise<void> {
	await getDb()
		.update(windowCleaningJob)
		.set(withUpdatedAt({ invoiceSentAt: sentAt }, sentAt))
		.where(eq(windowCleaningJob.id, id));
}
