-- Schema was applied manually. This file records it; do not replay on the existing database.
create table public.memory_facts (
  user_id text not null,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  constraint memory_facts_user_id_key_unique unique (user_id, key)
);

alter table public.memory_facts enable row level security;
-- No public policies: access is through the server-only Supabase secret key.
