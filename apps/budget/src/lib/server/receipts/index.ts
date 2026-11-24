import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import type { Category } from '#lib';
import { expenseSchema } from '#lib/formSchemas/index.js';
import { createWriteActions } from '#lib/server/actions/crud-helpers.js';
import { createExpense, deleteExpense, updateExpense } from '#lib/server/db/writes/expenses.js';
import { getMonthRangeFromUrl, getYearDateRange } from '#lib/utils/dates.js';

/** Fuel receipts are the expenses in this category; business receipts are everything else. */
const FUEL_CATEGORY_NAME = 'Gas';

/** Shared load context for the fuel and business receipt pages. */
export async function getReceiptLoadContext(url: URL, categories: Category[] | undefined) {
	const gasCategory = categories?.find((c) => c.name === FUEL_CATEGORY_NAME);
	if (!gasCategory) throw error(404, `${FUEL_CATEGORY_NAME} category not found`);

	const { year, startDate, endDate } = getMonthRangeFromUrl(url);
	const { startDate: yearStartDate, endDate: yearEndDate } = getYearDateRange(year);
	const form = await superValidate(zod4(expenseSchema));

	return { gasCategory, year, startDate, endDate, yearStartDate, yearEndDate, form };
}

/** CRUD actions shared by both receipt pages; receipts are ordinary expenses. */
export const receiptActions = createWriteActions({
	schema: expenseSchema,
	entityName: 'Expense',
	create: createExpense,
	update: updateExpense,
	delete: deleteExpense
});
