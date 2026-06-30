-- Run after Drizzle creates the tables. Drizzle owns table shape; this file owns Supabase RLS.
-- Every user-owned table must keep auth.uid() aligned with user_id.

alter table profiles enable row level security;
alter table user_preferences enable row level security;
alter table user_memories enable row level security;
alter table encrypted_vault_keys enable row level security;
alter table user_provider_keys enable row level security;
alter table model_presets enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table message_parts enable row level security;
alter table conversation_summaries enable row level security;
alter table attachments enable row level security;
alter table attachment_storage_deletions enable row level security;
alter table usage_events enable row level security;
alter table shared_conversations enable row level security;
alter table shared_message_turns enable row level security;

create policy "profiles are self owned"
on profiles for all
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "preferences are self owned"
on user_preferences for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "memories are self owned"
on user_memories for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "vault keys are self owned"
on encrypted_vault_keys for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "provider keys are self owned"
on user_provider_keys for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "model presets are self owned"
on model_presets for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "conversations are self owned"
on conversations for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "messages are self owned"
on messages for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "message parts follow parent message ownership"
on message_parts for all
using (
  exists (
    select 1 from messages
    where messages.id = message_parts.message_id
    and messages.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from messages
    where messages.id = message_parts.message_id
    and messages.user_id = (select auth.uid())
  )
);

create policy "conversation summaries are self owned"
on conversation_summaries for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "attachments are self owned"
on attachments for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "attachment storage deletions are self owned"
on attachment_storage_deletions for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "usage events are self owned"
on usage_events for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "shares are self owned"
on shared_conversations for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "public conversation shares are readable"
on shared_conversations for select
to anon, authenticated
using (
  visibility in ('link', 'public')
  and snapshot_ciphertext is not null
  and snapshot_nonce is not null
  and (expires_at is null or expires_at > now())
);

create policy "shared message turns are self owned"
on shared_message_turns for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "public message turn shares are readable"
on shared_message_turns for select
to anon, authenticated
using (
  visibility in ('link', 'public')
  and (expires_at is null or expires_at > now())
);

-- Encrypted attachment blobs live in Supabase Storage. The bytes are encrypted
-- in the browser before upload; this policy only gates object access by user path.
insert into storage.buckets (id, name, public, file_size_limit)
values ('encrypted-attachments', 'encrypted-attachments', false, 52428800)
on conflict (id) do nothing;

create policy "encrypted attachments are self owned"
on storage.objects for all
using (
  bucket_id = 'encrypted-attachments'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid())::text
)
with check (
  bucket_id = 'encrypted-attachments'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
