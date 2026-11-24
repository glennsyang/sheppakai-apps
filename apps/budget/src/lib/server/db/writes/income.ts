import { eq } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import { incomeQueries } from '#lib/server/db/queries/index.js';
import { income } from '#lib/server/db/schema/index.js';
import { withUpdatedAt } from '#lib/server/db/utils.js';
import type { Income } from '#lib/types.js';
import { formatDateForStorage } from '#lib/utils/dates.js';

/** The single write path for Income: the `/income` form actions and `/api/v1/income` (#373). */

export type IncomeInput = {
	name: string;
	description: string;
	date: string;
	amount: number;
};

function toIncomeRow(input: IncomeInput) {
	return {
		name: input.name,
		description: input.description,
		date: formatDateForStorage(input.date),
		amount: input.amount
	};
}

export async function createIncome(input: IncomeInput, userId: string): Promise<Income> {
	const [inserted] = await getDb()
		.insert(income)
		.values({ ...toIncomeRow(input), userId })
		.returning();

	const withRelations = await incomeQueries.findById(inserted.id);
	if (!withRelations) {
		throw new Error(`Failed to re-fetch income ${inserted.id} after creation`);
	}
	return withRelations;
}

export async function updateIncome(id: string, input: IncomeInput): Promise<void> {
	await getDb()
		.update(income)
		.set(withUpdatedAt(toIncomeRow(input)))
		.where(eq(income.id, id));
}

export async function deleteIncome(id: string): Promise<void> {
	await getDb().delete(income).where(eq(income.id, id));
}
