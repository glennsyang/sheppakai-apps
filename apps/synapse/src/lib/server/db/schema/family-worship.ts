import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import { user } from './auth';

/**
 * Family Worship Topics
 * The catalog of study topics. Archived topics are hidden from scheduling but keep their history.
 */
export const familyWorshipTopics = sqliteTable(
	'family_worship_topics',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		description: text('description'),
		notes: text('notes'),
		scriptureRefs: text('scripture_refs'),
		links: text('links'), // JSON array of URLs
		isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
		archivedAt: integer('archived_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('family_worship_topics_user_idx').on(table.userId)]
);

/**
 * Family Worship Schedule
 * One planned topic per week, keyed by that week's Wednesday (YYYY-MM-DD).
 */
export const familyWorshipSchedule = sqliteTable(
	'family_worship_schedule',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		weekOf: text('week_of').notNull(),
		topicId: text('topic_id')
			.notNull()
			.references(() => familyWorshipTopics.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [uniqueIndex('family_worship_schedule_user_week_idx').on(table.userId, table.weekOf)]
);

/**
 * Family Worship Sessions
 * What happened in a given week: studied a topic ('done') or skipped. A topic can be
 * covered many weeks in a row; a session never marks it finished.
 */
export const familyWorshipSessions = sqliteTable(
	'family_worship_sessions',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		weekOf: text('week_of').notNull(),
		date: text('date').notNull(),
		status: text('status', { enum: ['done', 'skipped'] }).notNull(),
		topicId: text('topic_id').references(() => familyWorshipTopics.id, { onDelete: 'cascade' }),
		notes: text('notes'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		uniqueIndex('family_worship_sessions_user_week_idx').on(table.userId, table.weekOf),
		index('family_worship_sessions_topic_idx').on(table.topicId)
	]
);

export const familyWorshipTopicsRelations = relations(familyWorshipTopics, ({ one, many }) => ({
	user: one(user, { fields: [familyWorshipTopics.userId], references: [user.id] }),
	sessions: many(familyWorshipSessions),
	scheduledWeeks: many(familyWorshipSchedule)
}));

export const familyWorshipScheduleRelations = relations(familyWorshipSchedule, ({ one }) => ({
	user: one(user, { fields: [familyWorshipSchedule.userId], references: [user.id] }),
	topic: one(familyWorshipTopics, {
		fields: [familyWorshipSchedule.topicId],
		references: [familyWorshipTopics.id]
	})
}));

export const familyWorshipSessionsRelations = relations(familyWorshipSessions, ({ one }) => ({
	user: one(user, { fields: [familyWorshipSessions.userId], references: [user.id] }),
	topic: one(familyWorshipTopics, {
		fields: [familyWorshipSessions.topicId],
		references: [familyWorshipTopics.id]
	})
}));
