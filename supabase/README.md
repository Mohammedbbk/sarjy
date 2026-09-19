# Shared demo memory

All visitors intentionally share `demo-user`. The backend supplies this identity;
neither the browser nor the agent/model can choose it. No login or users table is used.

## Database status

`public.memory_facts` was **applied manually**, not by this application. The
`migrations/202609180001_create_memory_facts.sql` file records its schema and RLS
requirement. **Do not replay this migration against the existing table.** It is
only for provisioning a fresh database. No startup or deployment runs migrations.

RLS must be enabled with no public policies. Only the backend's Supabase secret
key accesses the table. Supabase REST schema metadata confirmed all four column
types, NOT NULL requirements, and the `now()` default on 2026-09-18. A live upsert
confirmed the composite conflict target works. Catalog-level RLS/policy inspection
is still pending because no SQL/management connection is configured. In the
Supabase SQL editor, these read-only queries verify the full configuration:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'memory_facts';
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.memory_facts'::regclass;
select relrowsecurity from pg_class where oid = 'public.memory_facts'::regclass;
select * from pg_policies where schemaname = 'public' and tablename = 'memory_facts';
```

Expected: four non-null columns (three text and `updated_at` timestamptz with
`now()` default), unique `(user_id, key)`, RLS true, and zero policies. If RLS needs
enabling, apply only `alter table public.memory_facts enable row level security;`
manually. Do not recreate the table or change policies on other tables.

## Configuration

- Web/Vercel: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `MEMORY_API_TOKEN`.
  Locally use `apps/web/.env.local`; the Vite API plugin loads these server-side.
- Agent/LiveKit: existing `SARJY_API_URL` (web backend origin) and the identical
  `MEMORY_API_TOKEN`. Locally use `apps/sarjy-agent/.env.local`. Use HTTPS in
  production; HTTP is accepted only for localhost development.
- Generate a new token locally with `openssl rand -hex 32`. This generates a new
  credential; it does not read or print any existing credentials. Copy it into
  the two deployment environments, never source files or browser configuration.
- Redeploy the web app and restart/redeploy the agent after setting variables.
  Keep existing LiveKit and Linear variables in place.

Supabase is imported only under `apps/web/api/`. The browser neither calls the
memory endpoint nor receives its credential. The agent calls authenticated
`GET /api/memory` and `POST /api/memory` (`{ "key": "favorite_color", "value": "purple" }`).
Both return structured `ok` results and `Cache-Control: no-store`. Empty facts
are a successful read; an outage is a failure, never an empty memory. Database
requests have a 5-second deadline; agent requests have a 7-second deadline.

Keys are trimmed and normalized to snake_case (64 characters maximum); values
are trimmed, nonempty text (1000 characters maximum). Spelling variants of
favorite/color normalize consistently. For semantic corrections, the agent must
reuse the existing key from the memory lookup rather than inventing a synonym.
Upserts atomically conflict on `(user_id,key)` and explicitly set `updated_at`.
Facts are loaded once before each conversation starts. Explicit facts/preferences
are saved during the conversation; saves are acknowledged only after backend
confirmation. Stored text is untrusted.

## Manual voice acceptance test (not yet exercised)

1. Say “Remember my favorite color is purple.” Wait for a confirmed save.
2. End the conversation and restart the agent.
3. Start a new conversation and ask for the favorite color. Expect purple.
4. Correct it to green, then verify another new conversation remembers green.
5. A different browser should recall green: shared memory is intentional.

Also disconnect memory storage temporarily and verify Sarjy reports memory
failure honestly while voice and Linear still work. No end-to-end voice test
has been claimed here.

For a live persistence smoke test, use a unique key such as
`sarjy_persistence_test_<random_hex>`, read it back, correct its value, and read
again through a fresh client. Clean up **only** that exact key for `demo-user`;
never clear all shared facts. Live persistence verification passed on 2026-09-18:
write purple, fresh read, correction to green, exactly one row, updated timestamp,
and deletion of only the uniquely named test fact. The local Vite HTTP route also
passed an authenticated database read, unauthenticated GET/POST rejection,
unsupported-method rejection, and no-store checks using an ephemeral test token.
The browser production bundle contains no Supabase or memory credential references.
RLS/policy inspection remains pending (no SQL connection or management access
configured). Production deployment and the manual voice test remain unverified.
