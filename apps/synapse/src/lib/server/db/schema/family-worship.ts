import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import { user } from './auth';

/**
 * Family Worship Topics
 * The catalog of things to study. Active topics form the Topic Queue, ordered by
 * `queuePosition`; an Archived Topic has no queue position.
 */
export const familyWorshipTopics = sqliteTable(
	'family_worship_topics',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		description: text('description').notNull(),
		notes: text('notes'),
		scriptureReferences: text('scripture_references'),
		publicationLinks: text('publication_links'), // JSON array of { label?, url }
		queuePosition: integer('queue_position'),
		isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
		archivedAt: integer('archived_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('family_worship_topics_user_queue_idx').on(table.userId, table.queuePosition)]
);

export const familyWorshipTopicsRelations = relations(familyWorshipTopics, ({ one }) => ({
	user: one(user, {
		fields: [familyWorshipTopics.userId],
		references: [user.id]
	})
}));

/**
 * Family Worship Settings
 * Per-user Usual Weekday (0 = Sunday … 6 = Saturday). A user without a row gets Wednesday.
 */
export const familyWorshipSettings = sqliteTable('family_worship_settings', {
	id: text('id').primaryKey().$defaultFn(generateId),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'cascade' }),
	usualWeekday: integer('usual_weekday').notNull().default(3),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const familyWorshipSettingsRelations = relations(familyWorshipSettings, ({ one }) => ({
	user: one(user, {
		fields: [familyWorshipSettings.userId],
		references: [user.id]
	})
}));
