import { eq } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import { expenseQueries } from '#lib/server/db/queries/index.js';
import { expense } from '#lib/server/db/schema/index.js';
import { withUpdatedAt } from '#lib/server/db/utils.js';
import {
	buildExpenseBudgetAlertUpdateContext,
	evaluateCreatedExpenseBudgetAlert,
	evaluateUpdatedExpenseBudgetAlert
} from '#lib/server/notifications/budget-threshold-alerts.js';
import type { Expense } from '#lib/types.js';
import { formatDateForStorage } from '#lib/utils/dates.js';

/**
 * The single write path for Expenses (#373). The form actions (`/expenses`, the receipt pages)
 * and `/api/v1/expenses` all go through here, so the Budget threshold alert runs whichever way
 * an Expense is saved.
 */

export type ExpenseInput = {
	amount: number;
	payee: string;
	notes: string;
	date: string;
	gstAmount?: number;
	excludedFromBudget: boolean;
	categoryId: string;
};

function toExpenseRow(input: ExpenseInput) {
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

/** Insert an Expense, then check whether it tipped its category over a Budget threshold. */
export async function createExpense(input: ExpenseInput, userId: string): Promise<Expense> {
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

/**
 * Update an Expense, then check the Budget threshold. The alert compares against the Expense as
 * it was before the update, so it is read first.
 */
export async function updateExpense(id: string, input: ExpenseInput): Promise<void> {
	const alertContext = await buildExpenseBudgetAlertUpdateContext(id);
	const row = withUpdatedAt(toExpenseRow(input));

	await getDb().update(expense).set(row).where(eq(expense.id, id));

	await evaluateUpdatedExpenseBudgetAlert(row, alertContext);
}

export async function deleteExpense(id: string): Promise<void> {
	await getDb().delete(expense).where(eq(expense.id, id));
}
