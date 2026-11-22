import { relations } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import category from './category';
import user from './user';

const expense = sqliteTable(
	'expenses',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		amount: real('amount').notNull(),
		payee: text('payee').notNull(),
		notes: text('notes').notNull(),
		date: text('date').notNull(),
		gstAmount: real('gst_amount'),
		excludedFromBudget: integer('excluded_from_budget', { mode: 'boolean' })
			.notNull()
			.default(false),
		categoryId: text('category_id')
			.notNull()
			.references(() => category.id),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		index('expenses_date_idx').on(table.date),
		index('expenses_category_date_idx').on(table.categoryId, table.date)
	]
);

export const expenseRelations = relations(expense, ({ one }) => ({
	category: one(category, { fields: [expense.categoryId], references: [category.id] }),
	user: one(user, { fields: [expense.userId], references: [user.id] })
}));

export default expense;
