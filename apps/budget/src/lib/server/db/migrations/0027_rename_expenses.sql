ALTER TABLE `transactions` RENAME TO `expenses`;--> statement-breakpoint
DROP INDEX `transactions_date_idx`;--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`date`);--> statement-breakpoint
DROP INDEX `transactions_category_date_idx`;--> statement-breakpoint
CREATE INDEX `expenses_category_date_idx` ON `expenses` (`category_id`,`date`);
