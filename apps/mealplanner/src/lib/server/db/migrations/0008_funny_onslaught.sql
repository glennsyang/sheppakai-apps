CREATE TABLE `recipe_cooks` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`user_id` text,
	`cooked_on` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recipe_cooks_recipe_id_idx` ON `recipe_cooks` (`recipe_id`);--> statement-breakpoint
ALTER TABLE `recipes` ADD `rating` integer;--> statement-breakpoint
ALTER TABLE `recipes` ADD `source_url` text;