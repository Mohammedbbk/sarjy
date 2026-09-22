  # Sarjy applications

Sarjy is a voice stand-up assistant with a durable four-step workflow: progress, blockers, today, and confirmation.

| Path | Purpose |
|---|---|
| `web` | React interface plus Vercel API handlers for identity, workflow, memory, LiveKit sessions, and read-only Linear tasks |
| `sarjy-agent` | LiveKit voice worker that turns conversation into validated workflow commands |

## Request flow

1. `GET /api/bootstrap` creates or resumes an opaque browser identity and active stand-up.
2. `POST /api/session` binds that stand-up to a unique LiveKit room. The participant token goes to the browser; a separate binding secret goes to the worker in server-side dispatch metadata.
3. The worker reads `/api/agent`, saves revisioned commands there, and accesses visitor memory through `/api/memory` with the same room binding.
4. The browser polls the durable snapshot while the call is active and explicitly finishes the stand-up after reviewing the recap.
5. `/api/tasks` reads a small shared Linear demo board. No endpoint can write to Linear.

## Local setup

Copy both `.env.example` files to `.env.local`. Use the same LiveKit project in both apps. The web app also needs Supabase and Linear credentials; the agent needs `SARJY_API_URL` as a local fallback.

```sh
pnpm --dir web install
pnpm --dir sarjy-agent install
pnpm --dir sarjy-agent dev
pnpm --dir web dev
```

Open `http://localhost:5180` and allow microphone access.

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
