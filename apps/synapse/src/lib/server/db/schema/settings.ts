import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import { user } from './auth';

/**
 * Dashboard Goal Settings
 * Per-user thresholds for dashboard widget goals (meditation weekly goal,
 * workout pace thresholds over a trailing 4-week window).
 */
export const dashboardGoalSettings = sqliteTable('dashboard_goal_settings', {
	id: text('id').primaryKey().$defaultFn(generateId),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'cascade' }),
	meditationWeeklyGoal: integer('meditation_weekly_goal').notNull(),
	workoutGreenThreshold: integer('workout_green_threshold').notNull(),
	workoutAmberThreshold: integer('workout_amber_threshold').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const dashboardGoalSettingsRelations = relations(dashboardGoalSettings, ({ one }) => ({
	user: one(user, {
		fields: [dashboardGoalSettings.userId],
		references: [user.id]
	})
}));
