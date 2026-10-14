PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_api_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`user_id` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`action` text NOT NULL,
	`status_code` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_audit_log`("id", "api_key_id", "user_id", "method", "path", "action", "status_code", "created_at") SELECT "id", "api_key_id", "user_id", "method", "path", "action", "status_code", "created_at" FROM `api_audit_log`;--> statement-breakpoint
DROP TABLE `api_audit_log`;--> statement-breakpoint
ALTER TABLE `__new_api_audit_log` RENAME TO `api_audit_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `api_audit_log_user_created_idx` ON `api_audit_log` (`user_id`,`created_at`);