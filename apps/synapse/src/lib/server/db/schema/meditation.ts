import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import { user } from './auth';

/**
 * Meditation Routines
 * Predefined or user-created meditation routines
 */
export const meditationRoutines = sqliteTable(
	'meditation_routines',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		description: text('description'),
		linkUrl: text('link_url').notNull(),
		durationMinutes: integer('duration_minutes').notNull(),
		moodTags: text('mood_tags').notNull(), // JSON array: ["Anxious", "Focused", etc.]
		isPredefined: integer('is_predefined', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('meditation_routines_user_idx').on(table.userId)]
);

export const meditationRoutinesRelations = relations(meditationRoutines, ({ one, many }) => ({
	user: one(user, {
		fields: [meditationRoutines.userId],
		references: [user.id]
	}),
	schedules: many(meditationSchedules),
	sessions: many(meditationSessions)
}));

/**
 * Meditation Schedules
 * Recurring meditation reminder schedules
 */
export const meditationSchedules = sqliteTable(
	'meditation_schedules',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		routineId: text('routine_id')
			.notNull()
			.references(() => meditationRoutines.id, { onDelete: 'cascade' }),
		cadence: text('cadence').notNull(), // 'daily' | 'weekly' | 'custom'
		daysOfWeek: text('days_of_week'), // JSON array of day numbers (0-6, 0=Sunday)
		time: text('time').notNull(), // HH:MM
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('meditation_schedules_user_idx').on(table.userId)]
);

export const meditationSchedulesRelations = relations(meditationSchedules, ({ one }) => ({
	user: one(user, {
		fields: [meditationSchedules.userId],
		references: [user.id]
	}),
	routine: one(meditationRoutines, {
		fields: [meditationSchedules.routineId],
		references: [meditationRoutines.id]
	})
}));

/**
 * Meditation Sessions
 * Completed meditation session logs
 */
export const meditationSessions = sqliteTable(
	'meditation_sessions',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		routineId: text('routine_id')
			.notNull()
			.references(() => meditationRoutines.id, { onDelete: 'cascade' }),
		completedAt: integer('completed_at', { mode: 'timestamp' }).notNull(),
		preMoodRating: integer('pre_mood_rating'), // 1-5 pre-meditation mood
		moodRating: integer('mood_rating'), // 1-5 post-meditation mood
		notes: text('notes'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('meditation_sessions_user_completed_idx').on(table.userId, table.completedAt)]
);

export const meditationSessionsRelations = relations(meditationSessions, ({ one }) => ({
	user: one(user, {
		fields: [meditationSessions.userId],
		references: [user.id]
	}),
	routine: one(meditationRoutines, {
		fields: [meditationSessions.routineId],
		references: [meditationRoutines.id]
	})
}));
