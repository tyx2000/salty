CREATE TABLE "conversation_summaries" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"source_conversation_id" uuid,
	"source_message_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_last_message_id_messages_id_fk" FOREIGN KEY ("last_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_source_conversation_id_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "conversation_summaries_user_updated_idx" ON "conversation_summaries" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE INDEX "user_memories_user_status_updated_idx" ON "user_memories" USING btree ("user_id","status","updated_at");
--> statement-breakpoint
ALTER TABLE "conversation_summaries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_memories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "conversation summaries are self owned"
ON "conversation_summaries" FOR ALL
USING ((select auth.uid()) = "user_id")
WITH CHECK ((select auth.uid()) = "user_id");
--> statement-breakpoint
CREATE POLICY "memories are self owned"
ON "user_memories" FOR ALL
USING ((select auth.uid()) = "user_id")
WITH CHECK ((select auth.uid()) = "user_id");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "conversation_summaries";
    ALTER PUBLICATION supabase_realtime ADD TABLE "user_memories";
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
