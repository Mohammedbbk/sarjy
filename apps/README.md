# Sarjy applications

Sarjy is a voice stand-up assistant with a durable four-step workflow: progress, blockers, today, and confirmation.

| Path | Purpose |
|---|---|
| `web` | React interface plus Vercel API handlers for identity, workflow, memory, LiveKit sessions, and approved Linear changes |
| `sarjy-agent` | LiveKit voice worker that turns conversation into validated workflow commands |

## Request flow

1. `GET /api/bootstrap` creates or resumes an opaque browser identity and active stand-up.
2. `POST /api/session` binds that stand-up to a unique LiveKit room. The participant token goes to the browser; a separate binding secret goes to the worker in server-side dispatch metadata.
3. The worker reads `/api/agent`, saves revisioned commands there, and accesses visitor memory through `/api/memory` with the same room binding.
4. The browser polls the durable snapshot while the call is active and explicitly finishes the stand-up after reviewing the recap.
5. `/api/tasks` reads a small shared Linear demo board. The worker can propose a new ticket, comment, or status change through `/api/agent-actions`; only the visitor's browser can confirm it through `/api/actions`. The resulting receipt is saved and shown on the proposal card.

## Local setup

Copy both `.env.example` files to `.env.local`. Use the same LiveKit project in both apps. The web app also needs Supabase and Linear credentials; the agent needs `SARJY_API_URL` as a local fallback.

```sh
pnpm --dir web install
pnpm --dir sarjy-agent install
pnpm --dir sarjy-agent dev
pnpm --dir web dev
```

Open `http://localhost:5180` and allow microphone access. Run both processes: Vite dispatches to `sarjy-agent-local`, which `pnpm --dir sarjy-agent dev` registers. Calls pass the local API URL to that worker. Set `SARJY_AGENT_NAME` in both apps and `SARJY_PUBLIC_API_URL` in the web app only when intentionally overriding this routing.

## Verification

```sh
pnpm --dir web test
pnpm --dir web build
pnpm --dir web lint

pnpm --dir sarjy-agent test
pnpm --dir sarjy-agent typecheck
pnpm --dir sarjy-agent lint
```

For transactional database coverage, see [`../supabase/README.md`](../supabase/README.md).


### Ticket creation rollout

Apply `supabase/migrations/202609230001_create_linear_tickets.sql` before deploying the web API and restarting or deploying the voice agent. The migration adds new-ticket proposals and their verified Linear receipts while preserving browser approval. Existing comment and status callers remain compatible through default RPC arguments.

Ask Sarjy to create a ticket with a title and description, review the proposed card, and click **Apply to Linear**. The board refreshes after approval. Saying work is planned or finishing a stand-up does not create a ticket automatically. If an outcome is uncertain, use **Check outcome**; it reads the preallocated issue UUID without submitting a second create request.

Consecutive user transcription segments display in one entry, and the agent's minimum endpointing delay is 400 ms. Validate the pause timing with a live microphone call after restarting the agent.
