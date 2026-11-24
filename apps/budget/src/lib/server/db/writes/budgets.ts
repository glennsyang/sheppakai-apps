import { getDb } from '#lib/server/db/index.js';
import { budget } from '#lib/server/db/schema/index.js';

export type SaveBudgetInput = {
	amount: number;
	month: string;
	year: string;
	categoryId: string;
	presetType?: string | null;
};

/**
 * Sets the Household's Budget for a category and month. Budgets are one per category per month
 * whoever set them (#380), so saving where one already exists updates it instead of adding a
 * second row — e.g. when both members save from a page loaded before either Budget existed.
 * `userId` records who first set it and is left alone on update.
 */
export function saveBudget(input: SaveBudgetInput, userId: string, now = new Date()) {
	const values = {
		amount: input.amount,
		presetType: input.presetType || null,
		updatedAt: now
	};

	getDb()
		.insert(budget)
		.values({
			...values,
			month: input.month,
			year: input.year,
			categoryId: input.categoryId,
			userId
		})
		.onConflictDoUpdate({
			target: [budget.categoryId, budget.year, budget.month],
			set: values
		})
		.run();
}
