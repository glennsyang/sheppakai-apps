-- #46: budget createdAt/updatedAt (and window_cleaning_customers.deleted_at) move from
-- text ('YYYY-MM-DD HH:MM:SS', UTC) to integer epoch seconds, matching mealplanner and
-- better-auth. created_by/updated_by are dropped; every row is already scoped by user_id.
--
-- The migrator runs inside a transaction, where `PRAGMA foreign_keys=OFF` is a no-op, so
-- drizzle's usual rebuild (create a copy, drop the original, rename the copy) fails: dropping
-- a parent orphans its children. With foreign keys on, renaming a parent also repoints its
-- children's FKs at the new name. So: rename each parent aside and recreate it under its real
-- name; then rebuild every other table (each child's new FK targets the new parent); finally
-- drop the old parents, which by then nothing references.
ALTER TABLE `category` RENAME TO `__old_category`;--> statement-breakpoint
CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `category`("id", "name", "description", "created_at", "updated_at") SELECT "id", "name", "description", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_category`;--> statement-breakpoint
ALTER TABLE `savings_goals` RENAME TO `__old_savings_goals`;--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`target_amount` real NOT NULL,
	`target_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `savings_goals`("id", "name", "description", "target_amount", "target_date", "status", "user_id", "created_at", "updated_at") SELECT "id", "name", "description", "target_amount", "target_date", "status", "user_id", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_savings_goals`;--> statement-breakpoint
ALTER TABLE `window_cleaning_customers` RENAME TO `__old_window_cleaning_customers`;--> statement-breakpoint
CREATE TABLE `window_cleaning_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`unit_number` text,
	`buzzer_number` text,
	`phone_number` text,
	`email` text,
	`notes` text,
	`deleted_at` integer,
	`deleted_by` text,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `window_cleaning_customers`("id", "name", "address", "city", "unit_number", "buzzer_number", "phone_number", "email", "notes", "deleted_at", "deleted_by", "user_id", "created_at", "updated_at") SELECT "id", "name", "address", "city", "unit_number", "buzzer_number", "phone_number", "email", "notes", CAST(strftime('%s', "deleted_at") AS INTEGER), "deleted_by", "user_id", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_window_cleaning_customers`;--> statement-breakpoint
ALTER TABLE `budget` RENAME TO `__old_budget`;--> statement-breakpoint
CREATE TABLE `budget` (
	`id` text PRIMARY KEY NOT NULL,
	`amount` real NOT NULL,
	`month` text NOT NULL,
	`year` text NOT NULL,
	`preset_type` text,
	`category_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `budget`("id", "amount", "month", "year", "preset_type", "category_id", "user_id", "created_at", "updated_at") SELECT "id", "amount", "month", "year", "preset_type", "category_id", "user_id", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_budget`;--> statement-breakpoint
DROP TABLE `__old_budget`;--> statement-breakpoint
ALTER TABLE `contributions` RENAME TO `__old_contributions`;--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`amount` real NOT NULL,
	`date` text NOT NULL,
	`description` text,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `savings_goals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `contributions`("id", "goal_id", "amount", "date", "description", "user_id", "created_at", "updated_at") SELECT "id", "goal_id", "amount", "date", "description", "user_id", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_contributions`;--> statement-breakpoint
DROP TABLE `__old_contributions`;--> statement-breakpoint
ALTER TABLE `income` RENAME TO `__old_income`;--> statement-breakpoint
CREATE TABLE `income` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`date` text DEFAULT '' NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `income`("id", "name", "description", "amount", "date", "user_id", "created_at", "updated_at") SELECT "id", "name", "description", "amount", "date", "user_id", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_income`;--> statement-breakpoint
DROP TABLE `__old_income`;--> statement-breakpoint
ALTER TABLE `recurring` RENAME TO `__old_recurring`;--> statement-breakpoint
CREATE TABLE `recurring` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant` text NOT NULL,
	`description` text NOT NULL,
	`cadence` text NOT NULL,
	`amount` real NOT NULL,
	`paid` integer DEFAULT false NOT NULL,
	`due_day` integer,
	`due_month` integer,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `recurring`("id", "merchant", "description", "cadence", "amount", "paid", "due_day", "due_month", "user_id", "created_at", "updated_at") SELECT "id", "merchant", "description", "cadence", "amount", "paid", "due_day", "due_month", "user_id", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_recurring`;--> statement-breakpoint
DROP TABLE `__old_recurring`;--> statement-breakpoint
ALTER TABLE `savings` RENAME TO `__old_savings`;--> statement-breakpoint
CREATE TABLE `savings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`amount` real NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `savings`("id", "title", "description", "amount", "user_id", "created_at", "updated_at") SELECT "id", "title", "description", "amount", "user_id", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_savings`;--> statement-breakpoint
DROP TABLE `__old_savings`;--> statement-breakpoint
ALTER TABLE `transactions` RENAME TO `__old_transactions`;--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`amount` real NOT NULL,
	`payee` text NOT NULL,
	`notes` text NOT NULL,
	`date` text NOT NULL,
	`gst_amount` real,
	`excluded_from_budget` integer DEFAULT false NOT NULL,
	`category_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `transactions`("id", "amount", "payee", "notes", "date", "gst_amount", "excluded_from_budget", "category_id", "user_id", "created_at", "updated_at") SELECT "id", "amount", "payee", "notes", "date", "gst_amount", "excluded_from_budget", "category_id", "user_id", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_transactions`;--> statement-breakpoint
DROP TABLE `__old_transactions`;--> statement-breakpoint
ALTER TABLE `window_cleaning_jobs` RENAME TO `__old_window_cleaning_jobs`;--> statement-breakpoint
CREATE TABLE `window_cleaning_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`job_date` text NOT NULL,
	`job_time` text,
	`amount_charged` real NOT NULL,
	`tip` real DEFAULT 0 NOT NULL,
	`duration_hours` real,
	`notes` text,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `window_cleaning_customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `window_cleaning_jobs`("id", "customer_id", "job_date", "job_time", "amount_charged", "tip", "duration_hours", "notes", "user_id", "created_at", "updated_at") SELECT "id", "customer_id", "job_date", "job_time", "amount_charged", "tip", "duration_hours", "notes", "user_id", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_window_cleaning_jobs`;--> statement-breakpoint
DROP TABLE `__old_window_cleaning_jobs`;--> statement-breakpoint
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `api_audit_log`("id", "api_key_id", "user_id", "method", "path", "action", "status_code", "created_at") SELECT "id", "api_key_id", "user_id", "method", "path", "action", "status_code", CAST(strftime('%s', "created_at") AS INTEGER) FROM `__old_api_audit_log`;--> statement-breakpoint
DROP TABLE `__old_api_audit_log`;--> statement-breakpoint
ALTER TABLE `dashboard_section_preference` RENAME TO `__old_dashboard_section_preference`;--> statement-breakpoint
CREATE TABLE `dashboard_section_preference` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`section_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `dashboard_section_preference`("id", "user_id", "section_key", "created_at", "updated_at") SELECT "id", "user_id", "section_key", CAST(strftime('%s', "created_at") AS INTEGER), CAST(strftime('%s', "updated_at") AS INTEGER) FROM `__old_dashboard_section_preference`;--> statement-breakpoint
DROP TABLE `__old_dashboard_section_preference`;--> statement-breakpoint
DROP TABLE `__old_category`;--> statement-breakpoint
DROP TABLE `__old_savings_goals`;--> statement-breakpoint
DROP TABLE `__old_window_cleaning_customers`;--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_section_preference_user_section_idx` ON `dashboard_section_preference` (`user_id`,`section_key`);
