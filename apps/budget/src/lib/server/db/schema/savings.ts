import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import user from './user';

const savings = sqliteTable('savings', {
	id: text('id').primaryKey().$defaultFn(generateId),
	title: text('title').notNull(),
	description: text('description'),
	amount: real('amount').notNull(),
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

export const savingsRelations = relations(savings, ({ one }) => ({
	user: one(user, { fields: [savings.userId], references: [user.id] })
}));

export default savings;
