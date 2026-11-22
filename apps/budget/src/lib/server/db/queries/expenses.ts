import { and, desc, eq, isNotNull, ne, or, sql } from 'drizzle-orm';

import type { Expense } from '#lib/types.js';

import { getDb } from '../index';
import { expense } from '../schema';
import { dateInRange } from '../utils';
import { createQueryBuilder } from './factory';

// Hard cap on full-text search results. Leading-wildcard LIKE patterns cannot use a
// B-tree index, so this limits the work done per interactive query. If the table grows
// to a scale where this bound is regularly hit, replace with an SQLite FTS5 virtual
// table and use MATCH instead of LIKE.
// Kept module-private: callers read `limitReached` off the search result instead.
const SEARCH_RESULT_LIMIT = 200;

type CategoryMonthTotal = {
	categoryId: string;
	month: string;
	year: string;
	total: number;
};

const baseBuilder = createQueryBuilder({
	tableName: 'expense',
	defaultRelations: { category: true, user: true },
	defaultOrderBy: [desc(expense.date)]
});

export const expenseQueries = {
	...baseBuilder,

	// Find by date range (most common pattern for expenses)
	findByDateRange: async (startDate: string, endDate: string): Promise<Expense[]> => {
		return baseBuilder.findAll({
			where: and(...dateInRange(expense.date, startDate, endDate))
		});
	},

	// Find budget-counted expenses by date range.
	findByDateRangeIncludedInBudget: async (
		startDate: string,
		endDate: string
	): Promise<Expense[]> => {
		return baseBuilder.findAll({
			where: and(
				...dateInRange(expense.date, startDate, endDate),
				eq(expense.excludedFromBudget, false)
			)
		});
	},

	// Find excluded expenses by date range for separate reporting.
	findByDateRangeExcludedFromBudget: async (
		startDate: string,
		endDate: string
	): Promise<Expense[]> => {
		return baseBuilder.findAll({
			where: and(
				...dateInRange(expense.date, startDate, endDate),
				eq(expense.excludedFromBudget, true)
			)
		});
	},

	// Find by month/year (convenience method)
	findByMonth: async (month: number, year: number): Promise<Expense[]> => {
		const paddedMonth = String(month).padStart(2, '0');
		const startDate = `${year}-${paddedMonth}-01`;
		const lastDay = new Date(year, month, 0).getDate();
		const endDate = `${year}-${paddedMonth}-${lastDay}`;
		return expenseQueries.findByDateRange(startDate, endDate);
	},

	// Find by category
	findByCategory: async (
		categoryId: string,
		dateRange?: { start: string; end: string }
	): Promise<Expense[]> => {
		const where = dateRange
			? and(
					eq(expense.categoryId, categoryId),
					...dateInRange(expense.date, dateRange.start, dateRange.end)
				)
			: eq(expense.categoryId, categoryId);

		return baseBuilder.findAll({ where });
	},

	// Search across all expenses by payee or notes (cross-month).
	// Bounded to SEARCH_RESULT_LIMIT rows to prevent unbounded full-table scans;
	// a leading-wildcard LIKE cannot use a B-tree index. `limitReached` reports whether the
	// cap truncated the result set so callers can warn without knowing the limit itself.
	search: async (query: string): Promise<{ expenses: Expense[]; limitReached: boolean }> => {
		// Escape LIKE wildcards (\, %, _) so user input is treated as a literal string.
		// The ESCAPE clause tells SQLite that \ is the escape character in the pattern.
		const escaped = query
			.replaceAll('\\', String.raw`\\`)
			.replaceAll('%', String.raw`\%`)
			.replaceAll('_', String.raw`\_`);
		const pattern = `%${escaped}%`;
		const expenses = await baseBuilder.findAll({
			where: or(
				sql`${expense.payee} LIKE ${pattern} ESCAPE '\\'`,
				sql`${expense.notes} LIKE ${pattern} ESCAPE '\\'`
			),
			limit: SEARCH_RESULT_LIMIT
		});
		return { expenses, limitReached: expenses.length >= SEARCH_RESULT_LIMIT };
	},

	// Find by date range excluding a specific category (for business receipts)
	findByDateRangeExcludingCategory: async (
		startDate: string,
		endDate: string,
		excludeCategoryId: string,
		requireGst: boolean = false
	): Promise<Expense[]> => {
		const conditions = [
			...dateInRange(expense.date, startDate, endDate),
			ne(expense.categoryId, excludeCategoryId)
		];

		if (requireGst) {
			conditions.push(isNotNull(expense.gstAmount), sql`${expense.gstAmount} > 0`);
		}

		return baseBuilder.findAll({ where: and(...conditions) });
	},

	// Sum budget-counted expenses per category per month over a date range (budget history chart).
	sumByCategoryMonth: async (startDate: string, endDate: string): Promise<CategoryMonthTotal[]> => {
		return getDb()
			.select({
				categoryId: expense.categoryId,
				month: sql<string>`substr(${expense.date}, 6, 2)`,
				year: sql<string>`substr(${expense.date}, 1, 4)`,
				total: sql<number>`sum(${expense.amount})`
			})
			.from(expense)
			.where(
				and(...dateInRange(expense.date, startDate, endDate), eq(expense.excludedFromBudget, false))
			)
			.groupBy(expense.categoryId, sql`substr(${expense.date}, 1, 7)`)
			.all();
	}
};
