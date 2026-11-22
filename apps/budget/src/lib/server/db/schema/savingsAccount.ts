import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import user from './user';

const savingsAccount = sqliteTable('savings_accounts', {
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

export const savingsAccountRelations = relations(savingsAccount, ({ one }) => ({
	user: one(user, { fields: [savingsAccount.userId], references: [user.id] })
}));

export default savingsAccount;
