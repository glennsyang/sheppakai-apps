import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import user from './user';

const recurring = sqliteTable('recurring', {
	id: text('id').primaryKey().$defaultFn(generateId),
	merchant: text('merchant').notNull(),
	description: text('description').notNull(),
	cadence: text('cadence').$type<'Monthly' | 'Yearly'>().notNull(),
	amount: real('amount').notNull(),
	paid: integer('paid', { mode: 'boolean' }).notNull().default(false),
	dueDay: integer('due_day'),
	dueMonth: integer('due_month'),
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

export const recurringRelations = relations(recurring, ({ one }) => ({
	user: one(user, { fields: [recurring.userId], references: [user.id] })
}));

export default recurring;
