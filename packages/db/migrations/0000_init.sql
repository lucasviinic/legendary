CREATE TABLE `known_words` (
	`lemma` text PRIMARY KEY NOT NULL,
	`marked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quiz_questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quiz_id` integer NOT NULL,
	`sense_id` integer NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`user_answer` text,
	`correct` integer,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sense_id`) REFERENCES `word_senses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quiz_questions_quiz` ON `quiz_questions` (`quiz_id`);--> statement-breakpoint
CREATE TABLE `quizzes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	`score` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`sense_id` integer PRIMARY KEY NOT NULL,
	`ease` real NOT NULL,
	`interval_days` integer NOT NULL,
	`repetitions` integer NOT NULL,
	`due_at` integer NOT NULL,
	FOREIGN KEY (`sense_id`) REFERENCES `word_senses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `saved_words` (
	`sense_id` integer PRIMARY KEY NOT NULL,
	`saved_at` integer NOT NULL,
	FOREIGN KEY (`sense_id`) REFERENCES `word_senses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session_words` (
	`session_id` integer NOT NULL,
	`sense_id` integer NOT NULL,
	`count` integer NOT NULL,
	`context_sentence` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `sense_id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sense_id`) REFERENCES `word_senses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `word_senses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lemma` text NOT NULL,
	`pos` text NOT NULL,
	`translation` text NOT NULL,
	`explanation` text NOT NULL,
	`example_en` text NOT NULL,
	`example_pt` text NOT NULL,
	`cefr` text,
	`provider` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `word_senses_lemma_pos_translation` ON `word_senses` (`lemma`,`pos`,`translation`);--> statement-breakpoint
CREATE INDEX `word_senses_lemma_pos` ON `word_senses` (`lemma`,`pos`);