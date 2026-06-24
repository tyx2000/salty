DROP INDEX "message_parts_message_idx";--> statement-breakpoint
DROP INDEX "messages_conversation_idx";--> statement-breakpoint
DROP INDEX "user_provider_keys_user_provider_idx";--> statement-breakpoint
CREATE INDEX "attachments_message_idx" ON "attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_parts_message_order_idx" ON "message_parts" USING btree ("message_id","order_index");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_provider_keys_user_provider_idx" ON "user_provider_keys" USING btree ("user_id","provider");