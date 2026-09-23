# Sarjy voice agent

This LiveKit worker runs the spoken stand-up. The web app creates a room and sends a short-lived binding token to this worker through server-side dispatch metadata. The token lets the worker read and save only the visitor's current stand-up. The browser receives a separate participant token.

The conversation has four stages: progress, blockers, today, and confirmation. The worker uses structured tools to save each update, revise corrections, clarify ambiguous ticket references, and advance stages. It can propose a Linear comment or status change for a saved ticket update, but only the visitor can apply each proposal in the browser. The web backend validates and persists every command and records the Linear outcome. Personal facts are stored per visitor.

## Local development

Copy `.env.example` to `.env.local` and set the LiveKit project credentials and `SARJY_API_URL` to the local web app. Run the web app separately, then start this worker:

```sh
pnpm install
pnpm dev
```

## Checks

```sh
pnpm test
pnpm typecheck
pnpm lint
```

`src/workflow.test.ts` checks the room binding, response validation, revision conflicts, and retries, including a proposal request. `scenarios.yaml` describes spoken acceptance cases. A live call is still needed to validate the whole speech experience.

## API client convention

Keep response schemas in `src/api-schemas.ts` and validate every web API response before using it. Keep authentication, timeout, and JSON parsing in `WorkflowClient.request()`. Workflow methods own their own state rules: queue commands, wait for pending saves before proposing a Linear change, send the cached revision, and reuse the same request ID when retrying one command. A stale response updates the cache but does not silently reapply the command. If the outcome cannot be confirmed, report `outcome_unknown` and read the saved state before another attempt.

## Deployment

`livekit.toml` points to the existing LiveKit Cloud agent. After the matching web API is deployed, deploy from this directory:

```sh
lk agent deploy .
lk agent status
lk agent logs
```

The deployed worker needs `SARJY_API_URL` as a fallback web origin. The web server can also supply its public origin in dispatch metadata. LiveKit project credentials are managed by LiveKit Cloud for the deployed worker; Supabase and Linear credentials stay on the web backend.
