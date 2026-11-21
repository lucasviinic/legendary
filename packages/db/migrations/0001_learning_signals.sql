ALTER TABLE `session_words` ADD `searched` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `word_senses` ADD `polysemous` integer DEFAULT true NOT NULL;