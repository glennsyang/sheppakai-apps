import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import { user } from './auth';

/**
 * Journal Entries
 * Daily journal entries with optional metadata (location, weather)
 */
export const journalEntries = sqliteTable(
	'journal_entries',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		date: text('date').notNull(), // YYYY-MM-DD format
		content: text('content').notNull(),
		location: text('location'), // Optional location string
		weather: text('weather'), // Optional weather JSON object
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('journal_entries_user_date_idx').on(table.userId, table.date)]
);

export const journalEntriesRelations = relations(journalEntries, ({ one }) => ({
	user: one(user, {
		fields: [journalEntries.userId],
		references: [user.id]
	})
}));
