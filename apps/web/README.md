# Sarjy web

React + Vite frontend for the Sarjy voice stand-up, plus the session endpoint
that issues its LiveKit credentials.

See [`../README.md`](../README.md) for setup, the full run instructions, and how
the pieces fit together.

## Quick start

```sh
cp .env.example .env.local   # fill in your LiveKit project details
pnpm install
pnpm dev                     # frontend + API on http://localhost:5173
```

The agent has to be running too, or Sarjy never picks up:

```sh
pnpm --dir ../sarjy-agent dev
```

## Layout

```
api/
  session.ts          POST /api/session — the Vercel Function entry
  _lib/session.ts     token minting and agent dispatch (the only reader of the API secret)
vite/
  dev-api.ts          runs api/ inside `vite dev`, so dev and production share one handler
src/
  App.tsx             session lifecycle: useSession + SessionProvider + RoomAudioRenderer
  lib/session.ts      the token source and the error vocabulary shown to the user
  lib/useStandup.ts   stand-up stage machine, kept separate from LiveKit connection state
  lib/transcript.ts   session messages → transcript turns
  views/              idle · live · finished
  components/         presentational pieces
  mock/standup.ts     DEMO DATA: the Linear ticket list, and nothing else
```

## Scripts

| Command        | What it does                                        |
| -------------- | --------------------------------------------------- |
| `pnpm dev`     | Vite dev server, with `api/` mounted at `/api/*`     |
| `pnpm build`   | `tsc -b` across app, API and config, then `vite build` |
| `pnpm lint`    | oxlint                                              |
| `pnpm preview` | Serves `dist/` only — no API. Use `vercel dev` for both. |

## Environment

`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and optionally
`SARJY_AGENT_NAME` and `LIVEKIT_AGENT_DEPLOYMENT`. All server-side; see
`.env.example`.

Never give any of these a `VITE_` prefix. Vite inlines `VITE_*` variables into
the client bundle, so a `VITE_LIVEKIT_API_SECRET` would be readable by anyone
who opens the page.
