# Sarjy web

Vite app + Vercel functions. In dev, `vite/dev-api.ts` serves the `api/` handlers so you only need `pnpm dev`.

Endpoints:

- `GET /api/bootstrap`: visitor identity, active stand-up, previous recap.
- `POST /api/session`: room token plus server-side agent dispatch.
- `GET /api/tasks`: shared read-only Linear demo board.
- `GET|POST /api/agent`: room-bound context and durable commands.
- `GET|POST /api/memory`: room-bound visitor facts.
- `POST /api/workflow`: browser start, snapshot, command, and finish operations.
- `POST /api/agent-actions`: room-bound proposal creation; this route never writes to Linear.
- `GET|POST /api/actions`: visitor-scoped proposal list, approval, and outcome check. Approval is the only Linear write path.

Each proposal is one comment or one status change. A correction to its source update permanently makes an unapproved proposal outdated. Recent action receipts remain visible across stand-ups. The demo board is shared, so approved changes are visible to other visitors. Use fictional tickets in a dedicated Linear team.

Don't prefix server env vars with `VITE_`, Vite ships those to the browser.

`pnpm test`, `pnpm build`, `pnpm lint`. Set `SARJY_TEST_DATABASE_URL` to also run the SQL integration tests (see `supabase/README.md`).
