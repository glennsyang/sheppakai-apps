import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';

const category = sqliteTable('category', {
	id: text('id').primaryKey().$defaultFn(generateId),
	name: text('name').notNull(),
	description: text('description').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export default category;
