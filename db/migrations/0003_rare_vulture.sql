CREATE TABLE "attachment_storage_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"storage_path" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment_storage_deletions" ADD CONSTRAINT "attachment_storage_deletions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_storage_deletions_user_status_idx" ON "attachment_storage_deletions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "attachment_storage_deletions_user_storage_path_idx" ON "attachment_storage_deletions" USING btree ("user_id","bucket","storage_path");--> statement-breakpoint
ALTER TABLE "attachment_storage_deletions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attachment storage deletions are self owned"
ON "attachment_storage_deletions" FOR ALL
USING ((select auth.uid()) = "user_id")
WITH CHECK ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.delete_messages_atomic(p_message_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.attachment_storage_deletions (
    user_id,
    bucket,
    storage_path,
    status,
    updated_at
  )
  select distinct
    a.user_id,
    a.bucket,
    a.storage_path,
    'pending',
    now()
  from public.attachments a
  join public.messages m on m.id = a.message_id
  where a.message_id = any(coalesce(p_message_ids, array[]::uuid[]))
    and a.user_id = v_user_id
    and m.user_id = v_user_id
  on conflict (user_id, bucket, storage_path) do update
  set status = 'pending',
      updated_at = excluded.updated_at;

  delete from public.messages m
  where m.id = any(coalesce(p_message_ids, array[]::uuid[]))
    and m.user_id = v_user_id;
end;
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.delete_messages_atomic(uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_messages_atomic(uuid[]) TO authenticated;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.delete_conversation_atomic(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.attachment_storage_deletions (
    user_id,
    bucket,
    storage_path,
    status,
    updated_at
  )
  select distinct
    a.user_id,
    a.bucket,
    a.storage_path,
    'pending',
    now()
  from public.attachments a
  join public.conversations c on c.id = a.conversation_id
  where a.conversation_id = p_conversation_id
    and a.user_id = v_user_id
    and c.user_id = v_user_id
  on conflict (user_id, bucket, storage_path) do update
  set status = 'pending',
      updated_at = excluded.updated_at;

  delete from public.conversations c
  where c.id = p_conversation_id
    and c.user_id = v_user_id;
end;
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.delete_conversation_atomic(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_conversation_atomic(uuid) TO authenticated;
