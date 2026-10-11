CREATE INDEX `api_audit_log_user_created_idx` ON `api_audit_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_notifications_lookup_idx` ON `email_notifications` (`userId`,`notification_type`,`entity_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `journal_entries_user_date_idx` ON `journal_entries` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `meal_logs_user_date_idx` ON `meal_logs` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `meditation_routines_user_idx` ON `meditation_routines` (`user_id`);--> statement-breakpoint
CREATE INDEX `meditation_schedules_user_idx` ON `meditation_schedules` (`user_id`);--> statement-breakpoint
CREATE INDEX `meditation_sessions_user_completed_idx` ON `meditation_sessions` (`user_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `people_user_idx` ON `people` (`user_id`);--> statement-breakpoint
CREATE INDEX `visits_person_date_idx` ON `visits` (`person_id`,`date`);--> statement-breakpoint
CREATE INDEX `visits_user_date_idx` ON `visits` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `weight_entries_user_date_idx` ON `weight_entries` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `workout_exercises_log_idx` ON `workout_exercises` (`workout_log_id`);--> statement-breakpoint
CREATE INDEX `workout_logs_user_date_idx` ON `workout_logs` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `workout_reminders_user_idx` ON `workout_reminders` (`user_id`);