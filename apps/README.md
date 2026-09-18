# Sarjy

A voice stand-up assistant. You talk, Sarjy asks about your tickets.

Two apps:

| Path                | What it is                                                                |
| ------------------- | ------------------------------------------------------------------------- |
| `apps/web`          | React + Vite frontend, plus the `api/` endpoints: session tokens and Linear |
| `apps/sarjy-agent`  | The LiveKit voice agent (`agentName: sarjy-agent`), a Node worker process  |

## How a stand-up works

1. The browser calls `POST /api/session` on our own server.
2. That endpoint mints a fresh room name and participant identity, signs a
   short-lived (10 minute) participant token scoped to that one room, and puts
   an explicit dispatch for `sarjy-agent` into the token's room configuration.
   The LiveKit API key and secret stay on the server.
3. The browser joins the room with that token and publishes its microphone.
4. LiveKit sees the dispatch and hands the room to the agent worker, which joins
   and starts talking.

Agent dispatch is explicit because `sarjy-agent` sets `agentName` on its
`ServerOptions`: it only joins rooms whose token asks for it by name.

## Where the tickets come from

`GET /api/tasks` in `apps/web` is the one place that talks to Linear. It reads
the demo team's open issues (up to 25, most recently updated first) and reports
whether more exist.

Both the ticket rail and the agent read that endpoint:

- The **browser** fetches it on load and again when a stand-up starts. It is not
  polled on a timer.
- The **agent** fetches it from its `get_tasks` tool, over `SARJY_API_URL`.

So `LINEAR_API_KEY` lives in exactly one environment — the web app's — and the
tickets on screen are the same response Sarjy is reading.

The endpoint takes no parameters. The team is pinned by `LINEAR_TEAM_KEY` on the
server, so a caller cannot point it at another team, and it exposes only our
dedicated demo team rather than arbitrary workspace data.

It is read-only end to end: the Linear client sends queries and never mutations,
and there is no write path in either app. **Ticket updates are not supported
yet** — Sarjy can read and discuss a ticket, and is instructed never to claim it
changed one.

## Setup

Both apps need credentials from the **same** LiveKit project
(<https://cloud.livekit.io> → Settings → Keys). If they point at different
projects, the agent will never be dispatched into the web app's rooms.

```sh
# From apps/

cp web/.env.example web/.env.local
cp sarjy-agent/.env.example sarjy-agent/.env.local
# then fill in, following the comments in each file:
#   both apps   LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
#   web only    LINEAR_API_KEY / LINEAR_TEAM_KEY
#   agent only  SARJY_API_URL  (http://localhost:5173 locally)

pnpm --dir web install
pnpm --dir sarjy-agent install
```

`LINEAR_API_KEY` and `LINEAR_TEAM_KEY` belong to the web app only. The agent
never holds them — it calls `GET /api/tasks` instead — so there is one copy of
the Linear credentials and one place that can change what they reach.

`LINEAR_TEAM_KEY` is the team **key**: the short prefix on ticket identifiers,
the `ENG` in `ENG-482`. It is not the team's display name and not the workspace
slug in the Linear URL. It is matched case-insensitively against the teams the
API key can actually see; if it matches none, the endpoint fails with a
configuration error and names the real keys in the server log rather than
quietly picking a different team.

None of these variables is prefixed with `VITE_`, and none should be: Vite
inlines `VITE_*` variables into the browser bundle, which would publish the
LiveKit API secret and the Linear key to every visitor. The web app's
`.env.local` is read only by the API handlers.

## Running it

Two terminals, from `apps/`:

```sh
# 1. The agent worker. Registers with LiveKit and waits to be dispatched.
pnpm --dir sarjy-agent dev

# 2. The frontend and the API together, on http://localhost:5173
pnpm --dir web dev
```

`pnpm dev` in `apps/web` serves both: a Vite plugin (`vite/dev-api.ts`) loads
the handlers in `api/` into the dev server, so `POST /api/session` is answered
by the same module Vercel deploys as a function. There is no second process and
no proxy to one.

Open <http://localhost:5173>, press **Start stand-up**, and allow the
microphone when the browser asks.

To check the endpoint on its own:

```sh
curl -i -X POST http://localhost:5173/api/session \
  -H 'Content-Type: application/json' -d '{}'
# → 201 {"server_url":"wss://…","participant_token":"eyJ…"}

curl -i http://localhost:5173/api/tasks
# → 200 {"source":"linear","teamKey":"SAR","count":4,"hasMore":false,"tasks":[…]}
```

### Other commands

```sh
# apps/web
pnpm --dir web build      # typecheck (tsc -b) + production build
pnpm --dir web test       # api endpoint + Linear client tests
pnpm --dir web lint       # oxlint
pnpm --dir web preview    # serve the built frontend (no API — use `vercel dev`)

# apps/sarjy-agent
pnpm --dir sarjy-agent typecheck
pnpm --dir sarjy-agent test              # in-process agent tests
pnpm --dir sarjy-agent lint
lk agent simulate --scenarios sarjy-agent/scenarios.yaml   # live scenarios
```

To run the frontend and API through Vercel's own runtime locally, use
`npx vercel dev` from `apps/web` instead of `pnpm dev`. Both serve the same
endpoint; `pnpm dev` is faster and has HMR.

## Deploying

**Frontend + API → Vercel.** Create a project with **Root Directory** set to
`apps/web`. The Vite preset is detected automatically, and `api/session.ts` is
deployed as a Node.js function at `/api/session`, alongside `api/tasks.ts` at
`/api/tasks`. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
`LINEAR_API_KEY` and `LINEAR_TEAM_KEY` as Environment Variables in the project
settings — not in any file that ships to the browser.

**Agent → LiveKit Cloud.** `apps/sarjy-agent` has a Dockerfile ready for
`lk agent deploy`. See <https://docs.livekit.io/deploy/agents/>. A deployed
agent registers under `(sarjy-agent, production)`; to target another deployment
from the web app, set `LIVEKIT_AGENT_DEPLOYMENT` on the Vercel project.

The deployed agent also needs `SARJY_API_URL` set to the deployed web app's
origin, or `get_tasks` has no backend to ask.

## What is real and what is not

Real: the LiveKit room, your microphone, the agent's voice, the transcript on
screen, the connecting / listening / thinking / speaking indicator, and the
**Linear ticket list** — read live from Linear through `GET /api/tasks`.

Not real: anything that would require writing. There is no database and no write
path, so nothing a stand-up produces is stored — no ticket updates, no stage
progress, no written summary, and no memory of a previous session. `StageTrack`
and `ProposalCard` in `apps/web/src/components` are kept but mounted nowhere,
for exactly that reason. The agent is instructed never to claim otherwise.

The workspace is a dedicated demo team with fictional tickets, which is what the
**Demo workspace** label in the header and footer refers to.
