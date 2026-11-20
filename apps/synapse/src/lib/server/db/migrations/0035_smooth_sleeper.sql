CREATE TABLE `family_worship_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`week_of` text NOT NULL,
	`topic_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `family_worship_topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_worship_schedule_user_week_idx` ON `family_worship_schedule` (`user_id`,`week_of`);--> statement-breakpoint
CREATE TABLE `family_worship_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`week_of` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`topic_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `family_worship_topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_worship_sessions_user_week_idx` ON `family_worship_sessions` (`user_id`,`week_of`);--> statement-breakpoint
CREATE INDEX `family_worship_sessions_topic_idx` ON `family_worship_sessions` (`topic_id`);--> statement-breakpoint
CREATE TABLE `family_worship_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`notes` text,
	`scripture_refs` text,
	`links` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `family_worship_topics_user_idx` ON `family_worship_topics` (`user_id`);