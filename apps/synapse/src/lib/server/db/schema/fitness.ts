import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import { user } from './auth';

/**
 * Weight Entries
 * Weight tracking records for trend analysis
 */
export const weightEntries = sqliteTable(
	'weight_entries',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		date: text('date').notNull(), // YYYY-MM-DD
		time: text('time'), // Optional HH:MM
		weightLbs: integer('weight_lbs').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('weight_entries_user_date_idx').on(table.userId, table.date)]
);

export const weightEntriesRelations = relations(weightEntries, ({ one }) => ({
	user: one(user, {
		fields: [weightEntries.userId],
		references: [user.id]
	})
}));

/**
 * Goal Weights
 * Target weight goals for users
 */
export const goalWeights = sqliteTable('goal_weights', {
	id: text('id').primaryKey().$defaultFn(generateId),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'cascade' }),
	targetWeightLbs: integer('target_weight_lbs').notNull(),
	setDate: text('set_date').notNull(), // YYYY-MM-DD
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const goalWeightsRelations = relations(goalWeights, ({ one }) => ({
	user: one(user, {
		fields: [goalWeights.userId],
		references: [user.id]
	})
}));

/**
 * Workout Logs
 * Exercise session records
 */
export const workoutLogs = sqliteTable(
	'workout_logs',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		date: text('date').notNull(), // YYYY-MM-DD
		time: text('time'), // Optional HH:MM
		type: text('type', {
			enum: ['strength', 'cardio', 'hiit', 'walk', 'stretch', 'other']
		}).notNull(),
		durationMinutes: integer('duration_minutes'),
		steps: integer('steps'), // For walk workouts
		notes: text('notes'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('workout_logs_user_date_idx').on(table.userId, table.date)]
);

export const workoutLogsRelations = relations(workoutLogs, ({ one, many }) => ({
	user: one(user, {
		fields: [workoutLogs.userId],
		references: [user.id]
	}),
	exercises: many(workoutExercises)
}));

/**
 * Workout Exercises
 * Individual exercises within a strength workout
 */
export const workoutExercises = sqliteTable(
	'workout_exercises',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		workoutLogId: text('workout_log_id')
			.notNull()
			.references(() => workoutLogs.id, { onDelete: 'cascade' }),
		exerciseName: text('exercise_name').notNull(),
		sets: integer('sets'),
		reps: integer('reps'),
		weightLbs: integer('weight_lbs'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('workout_exercises_log_idx').on(table.workoutLogId)]
);

export const workoutExercisesRelations = relations(workoutExercises, ({ one }) => ({
	workoutLog: one(workoutLogs, {
		fields: [workoutExercises.workoutLogId],
		references: [workoutLogs.id]
	})
}));

/**
 * Meal Logs
 * Meal records with calorie tracking
 */
export const mealLogs = sqliteTable(
	'meal_logs',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		date: text('date').notNull(), // YYYY-MM-DD
		timeOfDay: text('time_of_day').notNull(), // 'breakfast' | 'lunch' | 'dinner' | 'snack'
		description: text('description').notNull(),
		caloriesEstimate: integer('calories_estimate'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('meal_logs_user_date_idx').on(table.userId, table.date)]
);

export const mealLogsRelations = relations(mealLogs, ({ one }) => ({
	user: one(user, {
		fields: [mealLogs.userId],
		references: [user.id]
	})
}));

/**
 * Daily Calorie Targets
 * Daily calorie goals for users
 */
export const dailyCalorieTargets = sqliteTable('daily_calorie_targets', {
	id: text('id').primaryKey().$defaultFn(generateId),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'cascade' }),
	targetCalories: integer('target_calories').notNull(),
	setDate: text('set_date').notNull(), // YYYY-MM-DD
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const dailyCalorieTargetsRelations = relations(dailyCalorieTargets, ({ one }) => ({
	user: one(user, {
		fields: [dailyCalorieTargets.userId],
		references: [user.id]
	})
}));

/**
 * Workout Reminders
 * Scheduled workout reminder notifications
 */
export const workoutReminders = sqliteTable(
	'workout_reminders',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		workoutType: text('workout_type').notNull(), // 'strength' | 'cardio' | 'hiit' | 'walk' | 'stretch' | 'other'
		cadence: text('cadence', { enum: ['daily', 'weekly'] }).notNull(),
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
	(table) => [index('workout_reminders_user_idx').on(table.userId)]
);

export const workoutRemindersRelations = relations(workoutReminders, ({ one }) => ({
	user: one(user, {
		fields: [workoutReminders.userId],
		references: [user.id]
	})
}));
