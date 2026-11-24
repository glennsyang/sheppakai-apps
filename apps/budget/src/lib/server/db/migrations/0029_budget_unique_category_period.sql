DROP INDEX `budget_user_category_period_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `budget_category_period_unique` ON `budget` (`category_id`,`year`,`month`);