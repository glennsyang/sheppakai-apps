import { eq } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import { contributionQueries } from '#lib/server/db/queries/index.js';
import { contribution } from '#lib/server/db/schema/index.js';
import { withUpdatedAt } from '#lib/server/db/utils.js';
import type { Contribution } from '#lib/types.js';
import { formatDateForStorage } from '#lib/utils/dates.js';

/**
 * The single write path for Contributions: the `/savings/goals` form actions and
 * `/api/v1/savings/goals/[id]/contributions` (#373).
 */

export type ContributionInput = {
	amount: number;
	date: string;
	description?: string;
};

function toContributionRow(goalId: string, input: ContributionInput) {
	return {
		goalId,
		amount: input.amount,
		date: formatDateForStorage(input.date),
		description: input.description || null
	};
}

export async function createContribution(
	goalId: string,
	input: ContributionInput,
	userId: string
): Promise<Contribution> {
	const [inserted] = await getDb()
		.insert(contribution)
		.values({ ...toContributionRow(goalId, input), userId })
		.returning();

	const withRelations = await contributionQueries.findById(inserted.id);
	if (!withRelations) {
		throw new Error(`Failed to re-fetch contribution ${inserted.id} after creation`);
	}
	return withRelations;
}

export async function updateContribution(
	id: string,
	goalId: string,
	input: ContributionInput
): Promise<void> {
	await getDb()
		.update(contribution)
		.set(withUpdatedAt(toContributionRow(goalId, input)))
		.where(eq(contribution.id, id));
}

export async function deleteContribution(id: string): Promise<void> {
	await getDb().delete(contribution).where(eq(contribution.id, id));
}
