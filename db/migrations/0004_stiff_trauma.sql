CREATE TABLE "shared_message_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"user_message_id" uuid NOT NULL,
	"assistant_message_id" uuid NOT NULL,
	"share_token_hash" text NOT NULL,
	"visibility" "share_visibility" DEFAULT 'link' NOT NULL,
	"snapshot_ciphertext" text NOT NULL,
	"snapshot_nonce" text NOT NULL,
	"snapshot_version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_conversations" ADD COLUMN "snapshot_ciphertext" text;--> statement-breakpoint
ALTER TABLE "shared_conversations" ADD COLUMN "snapshot_nonce" text;--> statement-breakpoint
ALTER TABLE "shared_conversations" ADD COLUMN "snapshot_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "shared_message_turns" ADD CONSTRAINT "shared_message_turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_message_turns" ADD CONSTRAINT "shared_message_turns_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_message_turns" ADD CONSTRAINT "shared_message_turns_user_message_id_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_message_turns" ADD CONSTRAINT "shared_message_turns_assistant_message_id_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shared_message_turns_token_idx" ON "shared_message_turns" USING btree ("share_token_hash");--> statement-breakpoint
CREATE INDEX "shared_message_turns_user_created_idx" ON "shared_message_turns" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "shared_message_turns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "public conversation shares are readable"
ON "shared_conversations" FOR SELECT
TO anon, authenticated
USING (
  "visibility" IN ('link', 'public')
  AND "snapshot_ciphertext" IS NOT NULL
  AND "snapshot_nonce" IS NOT NULL
  AND ("expires_at" IS NULL OR "expires_at" > now())
);--> statement-breakpoint
CREATE POLICY "shared message turns are self owned"
ON "shared_message_turns" FOR ALL
USING ((select auth.uid()) = "user_id")
WITH CHECK ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "public message turn shares are readable"
ON "shared_message_turns" FOR SELECT
TO anon, authenticated
USING (
  "visibility" IN ('link', 'public')
  AND ("expires_at" IS NULL OR "expires_at" > now())
);
