-- #315: recipes.source 'ai' becomes 'suggested' (column default and stored rows).
-- Hand-ordered rebuild: the generated "DROP TABLE recipes" would cascade-delete every
-- recipe_cooks and meal_plan_entries row, because PRAGMA foreign_keys=OFF is a no-op inside
-- the migrator's transaction. So: move recipes aside, recreate it, rebuild both child tables
-- against the new recipes, then drop the old parent last, when nothing references it.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
ALTER TABLE `recipes` RENAME TO `__old_recipes`;--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`ingredients_json` text NOT NULL,
	`instructions_json` text NOT NULL,
	`prep_time_minutes` integer NOT NULL,
	`servings` integer NOT NULL,
	`source` text DEFAULT 'suggested' NOT NULL,
	`rating` integer,
	`source_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `recipes`("id", "user_id", "name", "description", "ingredients_json", "instructions_json", "prep_time_minutes", "servings", "source", "rating", "source_url", "created_at", "updated_at") SELECT "id", "user_id", "name", "description", "ingredients_json", "instructions_json", "prep_time_minutes", "servings", CASE WHEN "source" = 'ai' THEN 'suggested' ELSE "source" END, "rating", "source_url", "created_at", "updated_at" FROM `__old_recipes`;--> statement-breakpoint
CREATE TABLE `__new_recipe_cooks` (
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
INSERT INTO `__new_recipe_cooks`("id", "recipe_id", "user_id", "cooked_on", "notes", "created_at", "updated_at") SELECT "id", "recipe_id", "user_id", "cooked_on", "notes", "created_at", "updated_at" FROM `recipe_cooks`;--> statement-breakpoint
DROP TABLE `recipe_cooks`;--> statement-breakpoint
ALTER TABLE `__new_recipe_cooks` RENAME TO `recipe_cooks`;--> statement-breakpoint
CREATE INDEX `recipe_cooks_recipe_id_idx` ON `recipe_cooks` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `__new_meal_plan_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_plan_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`recipe_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`meal_plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_meal_plan_entries`("id", "meal_plan_id", "day_of_week", "recipe_id", "created_at", "updated_at") SELECT "id", "meal_plan_id", "day_of_week", "recipe_id", "created_at", "updated_at" FROM `meal_plan_entries`;--> statement-breakpoint
DROP TABLE `meal_plan_entries`;--> statement-breakpoint
ALTER TABLE `__new_meal_plan_entries` RENAME TO `meal_plan_entries`;--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plan_entries_plan_day_idx` ON `meal_plan_entries` (`meal_plan_id`,`day_of_week`);--> statement-breakpoint
DROP TABLE `__old_recipes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
