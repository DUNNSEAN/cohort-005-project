CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_id` integer NOT NULL,
	`kind` text NOT NULL,
	`subject_id` integer NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipient_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_subject_idx` ON `notifications` (`kind`,`subject_id`);