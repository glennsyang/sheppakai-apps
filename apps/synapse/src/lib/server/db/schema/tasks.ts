import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import { user } from './auth';

/**
 * Tasks
 * Kanban-focused task items with priority, state, and tags
 */
export const tasks = sqliteTable(
	'tasks',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		taskNumber: integer('task_number').notNull().unique(),
		title: text('title').notNull(),
		description: text('description'),
		dueDate: text('due_date'), // Optional YYYY-MM-DD
		state: text('state').notNull().default('new'), // 'new' | 'in_progress' | 'on_hold' | 'blocked' | 'done'
		sortOrder: integer('sort_order').notNull().default(0),
		priority: integer('priority').notNull(), // 1-4 (1=highest, required)
		tags: text('tags'), // JSON array of strings
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		completedAt: integer('completed_at', { mode: 'timestamp' }) // when state changed to 'done'
	},
	(table) => [index('tasks_user_state_sort_idx').on(table.userId, table.state, table.sortOrder)]
);

export const tasksRelations = relations(tasks, ({ one }) => ({
	user: one(user, {
		fields: [tasks.userId],
		references: [user.id]
	})
}));
