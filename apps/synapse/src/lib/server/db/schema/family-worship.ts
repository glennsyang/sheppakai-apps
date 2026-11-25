import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

// Topic references below use the default NO ACTION rather than RESTRICT: both refuse deleting a
// topic that is still referenced, but NO ACTION is checked at the end of the statement, so deleting
// a user (which cascades to their topics and their weeks together) still succeeds.

/**
 * Family Worship Planned Weeks
 * The topic chosen for a week. A week is identified by its Monday (`weekStart`, YYYY-MM-DD in
 * Pacific time) and has at most one Planned Week.
 */
export const familyWorshipPlannedWeeks = sqliteTable(
	'family_worship_planned_weeks',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		weekStart: text('week_start').notNull(),
		topicId: text('topic_id')
			.notNull()
			.references(() => familyWorshipTopics.id),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		uniqueIndex('family_worship_planned_weeks_user_week_idx').on(table.userId, table.weekStart),
		index('family_worship_planned_weeks_topic_idx').on(table.topicId)
	]
);

export const familyWorshipPlannedWeeksRelations = relations(
	familyWorshipPlannedWeeks,
	({ one }) => ({
		user: one(user, { fields: [familyWorshipPlannedWeeks.userId], references: [user.id] }),
		topic: one(familyWorshipTopics, {
			fields: [familyWorshipPlannedWeeks.topicId],
			references: [familyWorshipTopics.id]
		})
	})
);

/**
 * Family Worship Sessions
 * One time family worship was held: the date, the one topic covered and an optional note. It
 * counts for the week its date falls in (`weekStart`), and a week has at most one.
 */
export const familyWorshipSessions = sqliteTable(
	'family_worship_sessions',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		weekStart: text('week_start').notNull(),
		topicId: text('topic_id')
			.notNull()
			.references(() => familyWorshipTopics.id),
		note: text('note'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		uniqueIndex('family_worship_sessions_user_week_idx').on(table.userId, table.weekStart),
		index('family_worship_sessions_user_topic_idx').on(table.userId, table.topicId)
	]
);

export const familyWorshipSessionsRelations = relations(familyWorshipSessions, ({ one }) => ({
	user: one(user, { fields: [familyWorshipSessions.userId], references: [user.id] }),
	topic: one(familyWorshipTopics, {
		fields: [familyWorshipSessions.topicId],
		references: [familyWorshipTopics.id]
	})
}));

/**
 * Family Worship Skipped Weeks
 * A week deliberately marked as having no family worship, with an optional reason.
 */
export const familyWorshipSkippedWeeks = sqliteTable(
	'family_worship_skipped_weeks',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		weekStart: text('week_start').notNull(),
		reason: text('reason'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		uniqueIndex('family_worship_skipped_weeks_user_week_idx').on(table.userId, table.weekStart)
	]
);

export const familyWorshipSkippedWeeksRelations = relations(
	familyWorshipSkippedWeeks,
	({ one }) => ({
		user: one(user, { fields: [familyWorshipSkippedWeeks.userId], references: [user.id] })
	})
);
