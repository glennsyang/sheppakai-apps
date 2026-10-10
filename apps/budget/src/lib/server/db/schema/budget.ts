import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import category from './category';
import user from './user';

const budget = sqliteTable('budget', {
	id: text('id').primaryKey().$defaultFn(generateId),
	amount: real('amount').notNull(),
	month: text('month').notNull(),
	year: text('year').notNull(),
	presetType: text('preset_type'),
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

export const budgetRelations = relations(budget, ({ one }) => ({
	category: one(category, { fields: [budget.categoryId], references: [category.id] }),
	user: one(user, { fields: [budget.userId], references: [user.id] })
}));

export default budget;
