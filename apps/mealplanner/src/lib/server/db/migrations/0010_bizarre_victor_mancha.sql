CREATE TABLE `shopping_list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`week_start_date` text NOT NULL,
	`item_key` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`aisle` text NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`manual` integer DEFAULT false NOT NULL,
	`pantry_item_id` text,
	`pantry_added_quantity` real,
	`pantry_created` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pantry_item_id`) REFERENCES `pantry_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shopping_list_items_week_key_idx` ON `shopping_list_items` (`week_start_date`,`item_key`);