CREATE INDEX `budget_user_category_period_idx` ON `budget` (`user_id`,`category_id`,`year`,`month`);--> statement-breakpoint
CREATE INDEX `income_date_idx` ON `income` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_category_date_idx` ON `transactions` (`category_id`,`date`);--> statement-breakpoint
CREATE INDEX `window_cleaning_jobs_job_date_idx` ON `window_cleaning_jobs` (`job_date`);