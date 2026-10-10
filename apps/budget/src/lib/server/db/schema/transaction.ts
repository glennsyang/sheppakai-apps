import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import category from './category';
import user from './user';

const transaction = sqliteTable('transactions', {
	id: text('id').primaryKey().$defaultFn(generateId),
	amount: real('amount').notNull(),
	payee: text('payee').notNull(),
	notes: text('notes').notNull(),
	date: text('date').notNull(),
	gstAmount: real('gst_amount'),
	excludedFromBudget: integer('excluded_from_budget', { mode: 'boolean' }).notNull().default(false),
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
});

export const transactionRelations = relations(transaction, ({ one }) => ({
	category: one(category, { fields: [transaction.categoryId], references: [category.id] }),
	user: one(user, { fields: [transaction.userId], references: [user.id] })
}));

export default transaction;
