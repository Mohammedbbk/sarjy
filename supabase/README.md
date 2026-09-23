# Sarjy database

| Migration | Status |
|---|---|
| `202609180001_create_memory_facts.sql` | Applied manually, don't rerun it. |
| `202609210001_visitor_workflow.sql` | Applied to the demo database. |
| `202609220001_linear_actions.sql` | Apply before deploying the approved Linear write-back. |

The workflow migration adds `visitors`, `standups`, `workflow_commands` and `voice_bindings`. The second migration adds `linear_actions` and the proposal, claim, and outcome functions. RLS is on with no policies; the backend only touches these tables through the `sarjy_*` functions. `memory_facts.user_id` holds the visitor id (old rows are left alone).

Integration tests need a throwaway db:

```sh
createdb sarjy_test
cd apps/web
SARJY_TEST_DATABASE_URL=postgresql://localhost:5432/sarjy_test pnpm test
```

The db name has to contain `test`, since the suite drops and rebuilds `public` from both migrations.

After applying the migration, check RLS and grants:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('visitors','standups','workflow_commands','voice_bindings','linear_actions');

select p.proname, has_function_privilege('public', p.oid, 'execute') as public_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'sarjy_%';
```

`rowsecurity` should be true everywhere and `public_execute` false for every function.
