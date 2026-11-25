CREATE TABLE `family_worship_planned_weeks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`week_start` text NOT NULL,
	`topic_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `family_worship_topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_worship_planned_weeks_user_week_idx` ON `family_worship_planned_weeks` (`user_id`,`week_start`);--> statement-breakpoint
CREATE INDEX `family_worship_planned_weeks_topic_idx` ON `family_worship_planned_weeks` (`topic_id`);--> statement-breakpoint
CREATE TABLE `family_worship_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`week_start` text NOT NULL,
	`topic_id` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `family_worship_topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_worship_sessions_user_week_idx` ON `family_worship_sessions` (`user_id`,`week_start`);--> statement-breakpoint
CREATE INDEX `family_worship_sessions_user_topic_idx` ON `family_worship_sessions` (`user_id`,`topic_id`);--> statement-breakpoint
CREATE TABLE `family_worship_skipped_weeks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`week_start` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_worship_skipped_weeks_user_week_idx` ON `family_worship_skipped_weeks` (`user_id`,`week_start`);