CREATE TABLE `recurring_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`recurring_id` text NOT NULL,
	`period` text NOT NULL,
	`paid_at` integer NOT NULL,
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_payment_recurring_period_idx` ON `recurring_payment` (`recurring_id`,`period`);--> statement-breakpoint
CREATE TABLE `recurring_version` (
	`id` text PRIMARY KEY NOT NULL,
	`recurring_id` text NOT NULL,
	`amount` real NOT NULL,
	`cadence` text NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recurring_version_recurring_from_idx` ON `recurring_version` (`recurring_id`,`effective_from`);--> statement-breakpoint
ALTER TABLE `recurring` ADD `ended_at` integer;