CREATE TABLE `morning_digest_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`send_time` text DEFAULT '06:00' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `morning_digest_settings_user_id_unique` ON `morning_digest_settings` (`user_id`);