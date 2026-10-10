-- #46: synapse instant columns (created_at, updated_at, completed_at, archived_at, sent_at)
-- move from ISO-8601 text to integer epoch seconds, matching budget, mealplanner and
-- better-auth. Existing values are converted with strftime('%s', ...); NULLs stay NULL.
--
-- The migrator runs inside a transaction, where `PRAGMA foreign_keys=OFF` is a no-op, so
-- drizzle's usual rebuild (create a copy, drop the original, rename the copy) would fire the
-- ON DELETE CASCADE from each parent table and wipe its children. With foreign keys on,
-- renaming a parent also repoints its children's FKs at the new name. So: rename each parent
-- aside and recreate it under its real name; then rebuild every other table (each child's
-- new FK targets the new parent); finally drop the old parents, which by then nothing
-- references. Indexes move with the renamed table, so each is recreated after its old
-- table is dropped.
ALTER TABLE `daily_agenda_templates` RENAME TO `__old_daily_agenda_templates`;--> statement-breakpoint
CREATE TABLE `daily_agenda_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`template_group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`days_of_week` text DEFAULT '[0,1,2,3,4,5,6]' NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `daily_agenda_templates`("id", "template_group_id", "user_id", "title", "sort_order", "days_of_week", "starts_on", "ends_on", "created_at", "updated_at") SELECT "id", "template_group_id", "user_id", "title", "sort_order", "days_of_week", "starts_on", "ends_on", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_daily_agenda_templates`;--> statement-breakpoint
ALTER TABLE `meditation_routines` RENAME TO `__old_meditation_routines`;--> statement-breakpoint
CREATE TABLE `meditation_routines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`title` text NOT NULL,
	`description` text,
	`link_url` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`mood_tags` text NOT NULL,
	`is_predefined` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `meditation_routines`("id", "user_id", "title", "description", "link_url", "duration_minutes", "mood_tags", "is_predefined", "created_at", "updated_at") SELECT "id", "user_id", "title", "description", "link_url", "duration_minutes", "mood_tags", "is_predefined", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_meditation_routines`;--> statement-breakpoint
ALTER TABLE `people` RENAME TO `__old_people`;--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`is_exempt` integer DEFAULT false NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`scheduled_visit_date` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `people`("id", "user_id", "name", "is_exempt", "is_archived", "archived_at", "scheduled_visit_date", "created_at", "updated_at") SELECT "id", "user_id", "name", "is_exempt", "is_archived", CAST(strftime('%s', "archived_at") AS INTEGER), "scheduled_visit_date", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_people`;--> statement-breakpoint
ALTER TABLE `workout_logs` RENAME TO `__old_workout_logs`;--> statement-breakpoint
CREATE TABLE `workout_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`type` text NOT NULL,
	`duration_minutes` integer,
	`steps` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `workout_logs`("id", "user_id", "date", "time", "type", "duration_minutes", "steps", "notes", "created_at", "updated_at") SELECT "id", "user_id", "date", "time", "type", "duration_minutes", "steps", "notes", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_workout_logs`;--> statement-breakpoint
ALTER TABLE `api_audit_log` RENAME TO `__old_api_audit_log`;--> statement-breakpoint
CREATE TABLE `api_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`user_id` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`action` text NOT NULL,
	`status_code` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `api_audit_log`("id", "api_key_id", "user_id", "method", "path", "action", "status_code", "created_at") SELECT "id", "api_key_id", "user_id", "method", "path", "action", "status_code", CAST(strftime('%s', "created_at") AS INTEGER) FROM `__old_api_audit_log`;--> statement-breakpoint
DROP TABLE `__old_api_audit_log`;--> statement-breakpoint
ALTER TABLE `daily_agenda_entries` RENAME TO `__old_daily_agenda_entries`;--> statement-breakpoint
CREATE TABLE `daily_agenda_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text,
	`template_group_id` text,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`source_type` text DEFAULT 'default' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `daily_agenda_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `daily_agenda_entries`("id", "user_id", "template_id", "template_group_id", "date", "title", "source_type", "sort_order", "completed", "completed_at", "created_at", "updated_at") SELECT "id", "user_id", "template_id", "template_group_id", "date", "title", "source_type", "sort_order", "completed", CAST(strftime('%s', "completed_at") AS INTEGER), CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_daily_agenda_entries`;--> statement-breakpoint
DROP TABLE `__old_daily_agenda_entries`;--> statement-breakpoint
CREATE INDEX `daily_agenda_entries_user_date_idx` ON `daily_agenda_entries` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `daily_agenda_entries_group_date_idx` ON `daily_agenda_entries` (`template_group_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_agenda_entries_default_unique_idx` ON `daily_agenda_entries` (`user_id`,`template_group_id`,`date`);--> statement-breakpoint
ALTER TABLE `daily_calorie_targets` RENAME TO `__old_daily_calorie_targets`;--> statement-breakpoint
CREATE TABLE `daily_calorie_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_calories` integer NOT NULL,
	`set_date` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `daily_calorie_targets`("id", "user_id", "target_calories", "set_date", "created_at", "updated_at") SELECT "id", "user_id", "target_calories", "set_date", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_daily_calorie_targets`;--> statement-breakpoint
DROP TABLE `__old_daily_calorie_targets`;--> statement-breakpoint
CREATE UNIQUE INDEX `daily_calorie_targets_user_id_unique` ON `daily_calorie_targets` (`user_id`);--> statement-breakpoint
ALTER TABLE `dashboard_goal_settings` RENAME TO `__old_dashboard_goal_settings`;--> statement-breakpoint
CREATE TABLE `dashboard_goal_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`meditation_weekly_goal` integer NOT NULL,
	`workout_green_threshold` integer NOT NULL,
	`workout_amber_threshold` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `dashboard_goal_settings`("id", "user_id", "meditation_weekly_goal", "workout_green_threshold", "workout_amber_threshold", "created_at", "updated_at") SELECT "id", "user_id", "meditation_weekly_goal", "workout_green_threshold", "workout_amber_threshold", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_dashboard_goal_settings`;--> statement-breakpoint
DROP TABLE `__old_dashboard_goal_settings`;--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_goal_settings_user_id_unique` ON `dashboard_goal_settings` (`user_id`);--> statement-breakpoint
ALTER TABLE `email_notifications` RENAME TO `__old_email_notifications`;--> statement-breakpoint
CREATE TABLE `email_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`notification_type` text NOT NULL,
	`entity_id` text,
	`sent_at` integer NOT NULL,
	`email_subject` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `email_notifications`("id", "userId", "notification_type", "entity_id", "sent_at", "email_subject", "created_at") SELECT "id", "userId", "notification_type", "entity_id", CAST(strftime('%s', "sent_at") AS INTEGER), "email_subject", CAST(strftime('%s', "created_at") AS INTEGER) FROM `__old_email_notifications`;--> statement-breakpoint
DROP TABLE `__old_email_notifications`;--> statement-breakpoint
ALTER TABLE `goal_weights` RENAME TO `__old_goal_weights`;--> statement-breakpoint
CREATE TABLE `goal_weights` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_weight_lbs` integer NOT NULL,
	`set_date` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `goal_weights`("id", "user_id", "target_weight_lbs", "set_date", "created_at", "updated_at") SELECT "id", "user_id", "target_weight_lbs", "set_date", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_goal_weights`;--> statement-breakpoint
DROP TABLE `__old_goal_weights`;--> statement-breakpoint
CREATE UNIQUE INDEX `goal_weights_user_id_unique` ON `goal_weights` (`user_id`);--> statement-breakpoint
ALTER TABLE `journal_entries` RENAME TO `__old_journal_entries`;--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`content` text NOT NULL,
	`location` text,
	`weather` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `journal_entries`("id", "user_id", "date", "content", "location", "weather", "created_at", "updated_at") SELECT "id", "user_id", "date", "content", "location", "weather", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_journal_entries`;--> statement-breakpoint
DROP TABLE `__old_journal_entries`;--> statement-breakpoint
ALTER TABLE `meal_logs` RENAME TO `__old_meal_logs`;--> statement-breakpoint
CREATE TABLE `meal_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`time_of_day` text NOT NULL,
	`description` text NOT NULL,
	`calories_estimate` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `meal_logs`("id", "user_id", "date", "time_of_day", "description", "calories_estimate", "created_at", "updated_at") SELECT "id", "user_id", "date", "time_of_day", "description", "calories_estimate", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_meal_logs`;--> statement-breakpoint
DROP TABLE `__old_meal_logs`;--> statement-breakpoint
ALTER TABLE `meditation_schedules` RENAME TO `__old_meditation_schedules`;--> statement-breakpoint
CREATE TABLE `meditation_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`routine_id` text NOT NULL,
	`cadence` text NOT NULL,
	`days_of_week` text,
	`time` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `meditation_routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `meditation_schedules`("id", "user_id", "routine_id", "cadence", "days_of_week", "time", "enabled", "created_at", "updated_at") SELECT "id", "user_id", "routine_id", "cadence", "days_of_week", "time", "enabled", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_meditation_schedules`;--> statement-breakpoint
DROP TABLE `__old_meditation_schedules`;--> statement-breakpoint
ALTER TABLE `meditation_sessions` RENAME TO `__old_meditation_sessions`;--> statement-breakpoint
CREATE TABLE `meditation_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`routine_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	`pre_mood_rating` integer,
	`mood_rating` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `meditation_routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `meditation_sessions`("id", "user_id", "routine_id", "completed_at", "pre_mood_rating", "mood_rating", "notes", "created_at", "updated_at") SELECT "id", "user_id", "routine_id", CAST(strftime('%s', "completed_at") AS INTEGER), "pre_mood_rating", "mood_rating", "notes", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_meditation_sessions`;--> statement-breakpoint
DROP TABLE `__old_meditation_sessions`;--> statement-breakpoint
ALTER TABLE `mood_logs` RENAME TO `__old_mood_logs`;--> statement-breakpoint
CREATE TABLE `mood_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`mood` text NOT NULL,
	`custom_mood` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `mood_logs`("id", "user_id", "date", "mood", "custom_mood", "notes", "created_at", "updated_at") SELECT "id", "user_id", "date", "mood", "custom_mood", "notes", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_mood_logs`;--> statement-breakpoint
DROP TABLE `__old_mood_logs`;--> statement-breakpoint
CREATE INDEX `mood_logs_user_date_idx` ON `mood_logs` (`user_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `mood_logs_user_date_unique_idx` ON `mood_logs` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `tasks` RENAME TO `__old_tasks`;--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_number` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`due_date` text,
	`state` text DEFAULT 'new' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`priority` integer NOT NULL,
	`tags` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `tasks`("id", "user_id", "task_number", "title", "description", "due_date", "state", "sort_order", "priority", "tags", "created_at", "updated_at", "completed_at") SELECT "id", "user_id", "task_number", "title", "description", "due_date", "state", "sort_order", "priority", "tags", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER), CAST(strftime('%s', "completed_at") AS INTEGER) FROM `__old_tasks`;--> statement-breakpoint
DROP TABLE `__old_tasks`;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_task_number_unique` ON `tasks` (`task_number`);--> statement-breakpoint
CREATE INDEX `tasks_user_state_sort_idx` ON `tasks` (`user_id`,`state`,`sort_order`);--> statement-breakpoint
ALTER TABLE `visit_status_settings` RENAME TO `__old_visit_status_settings`;--> statement-breakpoint
CREATE TABLE `visit_status_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recent_to_overdue_days` integer NOT NULL,
	`overdue_to_critical_days` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `visit_status_settings`("id", "user_id", "recent_to_overdue_days", "overdue_to_critical_days", "created_at", "updated_at") SELECT "id", "user_id", "recent_to_overdue_days", "overdue_to_critical_days", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_visit_status_settings`;--> statement-breakpoint
DROP TABLE `__old_visit_status_settings`;--> statement-breakpoint
CREATE UNIQUE INDEX `visit_status_settings_user_id_unique` ON `visit_status_settings` (`user_id`);--> statement-breakpoint
ALTER TABLE `visits` RENAME TO `__old_visits`;--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`companions` text,
	`notes` text,
	`follow_up_date` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `visits`("id", "person_id", "user_id", "date", "time", "companions", "notes", "follow_up_date", "created_at", "updated_at") SELECT "id", "person_id", "user_id", "date", "time", "companions", "notes", "follow_up_date", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_visits`;--> statement-breakpoint
DROP TABLE `__old_visits`;--> statement-breakpoint
ALTER TABLE `weight_entries` RENAME TO `__old_weight_entries`;--> statement-breakpoint
CREATE TABLE `weight_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`weight_lbs` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `weight_entries`("id", "user_id", "date", "time", "weight_lbs", "created_at", "updated_at") SELECT "id", "user_id", "date", "time", "weight_lbs", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_weight_entries`;--> statement-breakpoint
DROP TABLE `__old_weight_entries`;--> statement-breakpoint
ALTER TABLE `workout_exercises` RENAME TO `__old_workout_exercises`;--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_log_id` text NOT NULL,
	`exercise_name` text NOT NULL,
	`sets` integer,
	`reps` integer,
	`weight_lbs` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workout_log_id`) REFERENCES `workout_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `workout_exercises`("id", "workout_log_id", "exercise_name", "sets", "reps", "weight_lbs", "created_at", "updated_at") SELECT "id", "workout_log_id", "exercise_name", "sets", "reps", "weight_lbs", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_workout_exercises`;--> statement-breakpoint
DROP TABLE `__old_workout_exercises`;--> statement-breakpoint
ALTER TABLE `workout_reminders` RENAME TO `__old_workout_reminders`;--> statement-breakpoint
CREATE TABLE `workout_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workout_type` text NOT NULL,
	`cadence` text NOT NULL,
	`days_of_week` text,
	`time` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `workout_reminders`("id", "user_id", "workout_type", "cadence", "days_of_week", "time", "enabled", "created_at", "updated_at") SELECT "id", "user_id", "workout_type", "cadence", "days_of_week", "time", "enabled", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_workout_reminders`;--> statement-breakpoint
DROP TABLE `__old_workout_reminders`;--> statement-breakpoint
DROP TABLE `__old_daily_agenda_templates`;--> statement-breakpoint
CREATE INDEX `daily_agenda_templates_user_range_idx` ON `daily_agenda_templates` (`user_id`,`starts_on`,`ends_on`);--> statement-breakpoint
CREATE INDEX `daily_agenda_templates_group_idx` ON `daily_agenda_templates` (`template_group_id`);--> statement-breakpoint
DROP TABLE `__old_meditation_routines`;--> statement-breakpoint
DROP TABLE `__old_people`;--> statement-breakpoint
DROP TABLE `__old_workout_logs`;
