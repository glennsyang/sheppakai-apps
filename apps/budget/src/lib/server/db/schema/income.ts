import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { user } from '../schema';
import { generateId } from '../utils';

const income = sqliteTable('income', {
	id: text('id').primaryKey().$defaultFn(generateId),
	name: text('name').notNull().default(''),
	description: text('description').notNull(),
	amount: real('amount').notNull(),
	date: text('date').notNull().default(''),
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

export default income;
