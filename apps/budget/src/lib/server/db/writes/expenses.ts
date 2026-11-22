import { getDb } from '#lib/server/db/index.js';
import { expenseQueries } from '#lib/server/db/queries/index.js';
import { expense } from '#lib/server/db/schema/index.js';
import { evaluateCreatedExpenseBudgetAlert } from '#lib/server/notifications/budget-threshold-alerts.js';
import type { Expense } from '#lib/types.js';
import { formatDateForStorage } from '#lib/utils/dates.js';

export type CreateExpenseInput = {
	amount: number;
	payee: string;
	notes: string;
	date: string;
	gstAmount?: number;
	excludedFromBudget: boolean;
	categoryId: string;
};

/** Input → row mapping shared by the UI form actions and the API write path. */
export function toExpenseRow(input: CreateExpenseInput) {
	return {
		amount: input.amount,
		gstAmount: input.gstAmount ?? null,
		payee: input.payee,
		notes: input.notes,
		date: formatDateForStorage(input.date),
		excludedFromBudget: input.excludedFromBudget,
		categoryId: input.categoryId
	};
}

/**
 * Insert path for API-key-driven expense creation. Deliberately separate from the
 * generic `createCreateAction` factory in `src/lib/server/actions/crud-helpers.ts` so this
 * narrower write path can't regress the form-action UI. Runs the same budget-threshold-alert
 * hook, so an API-created expense behaves the same as a UI-created one.
 */
export async function createExpense(input: CreateExpenseInput, userId: string): Promise<Expense> {
	const [inserted] = await getDb()
		.insert(expense)
		.values({ ...toExpenseRow(input), userId })
		.returning();

	await evaluateCreatedExpenseBudgetAlert(inserted);

	const withRelations = await expenseQueries.findById(inserted.id);
	if (!withRelations) {
		throw new Error(`Failed to re-fetch expense ${inserted.id} after creation`);
	}
	return withRelations;
}
