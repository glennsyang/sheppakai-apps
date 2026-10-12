import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import { user } from './auth';

/**
 * Mood Logs
 * One mood record per user per Pacific day for analytics and lightweight reflection.
 */
export const moodLogs = sqliteTable(
	'mood_logs',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		mood: text('mood').notNull(),
		customMood: text('custom_mood'),
		notes: text('notes'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		index('mood_logs_user_date_idx').on(table.userId, table.date),
		uniqueIndex('mood_logs_user_date_unique_idx').on(table.userId, table.date)
	]
);

export const moodLogsRelations = relations(moodLogs, ({ one }) => ({
	user: one(user, {
		fields: [moodLogs.userId],
		references: [user.id]
	})
}));
