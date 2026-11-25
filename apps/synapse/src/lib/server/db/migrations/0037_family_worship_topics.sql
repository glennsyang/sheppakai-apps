CREATE TABLE `family_worship_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`usual_weekday` integer DEFAULT 3 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_worship_settings_user_id_unique` ON `family_worship_settings` (`user_id`);--> statement-breakpoint
CREATE TABLE `family_worship_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`notes` text,
	`scripture_references` text,
	`publication_links` text,
	`queue_position` integer,
	`is_archived` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `family_worship_topics_user_queue_idx` ON `family_worship_topics` (`user_id`,`queue_position`);