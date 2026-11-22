ALTER TABLE `recurring` RENAME TO `recurring_bills`;--> statement-breakpoint
ALTER TABLE `recurring_payment` RENAME TO `bill_payments`;--> statement-breakpoint
ALTER TABLE `recurring_version` RENAME TO `bill_prices`;--> statement-breakpoint
DROP INDEX `recurring_payment_recurring_period_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `bill_payments_bill_period_idx` ON `bill_payments` (`recurring_id`,`period`);--> statement-breakpoint
DROP INDEX `recurring_version_recurring_from_idx`;--> statement-breakpoint
CREATE INDEX `bill_prices_bill_from_idx` ON `bill_prices` (`recurring_id`,`effective_from`);--> statement-breakpoint
UPDATE `dashboard_section_preference` SET `section_key` = 'recurringBills' WHERE `section_key` = 'recurringExpenses';
