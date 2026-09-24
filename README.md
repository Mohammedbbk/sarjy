# Sarjy

Sarjy is a voice assistant that runs your daily stand-up. You talk, it listens, and it turns what you say into a saved recap: what you did, what's blocking you, and what you'll do today. It knows your team's Linear tickets, remembers things you ask it to remember, and picks up where you left off if the call drops.

**Try it:** https://sarjy-p.vercel.app. Open it in Chrome, allow the microphone, and press start.

> The first call after a quiet period can take 10 to 20 seconds before Sarjy joins. The agent runs on LiveKit Cloud's free plan, which shuts it down when idle.

## A two-minute demo

1. **Say several things at once.** Mention two tickets from the board in one answer. Both updates appear as separate saved notes.
2. **Change your mind.** "Actually, that second one isn't done yet, it's still in progress." The note is updated instead of the recap contradicting itself.
3. **Be vague.** "Today I'll work on KYC." Two KYC tickets exist, so Sarjy asks which one you mean. Finish stays blocked until you choose.
4. **Hang up halfway.** End the call, reload the page, and start again. Sarjy resumes at the first unanswered question with your earlier answers intact.
5. **Let it touch Linear.** "Can you mark that ticket as in progress?" Sarjy proposes the change and a card appears. Nothing is sent to Linear until you press approve.
6. **Finish and come back.** Review the recap and press finish. Tell Sarjy something personal ("my favourite colour is green"). Come back later: your previous recap is on screen, and Sarjy still knows the colour.

## Deep dive: multistep workflows

A stand-up is a small, fixed flow (progress → blockers → today → confirm), but people don't answer it in order. They answer three questions in one sentence, correct themselves, go off-topic, name the wrong ticket, or lose their connection. The goal was a stand-up whose saved state stays correct through all of that.

The main rule: **the language model decides what to do, but never owns the state.** It calls structured tools (`record_update`, `revise_update`, `note_ticket_ambiguity`, `skip_section`, …). The web backend validates each command and saves it in Postgres, and the tool reply tells the model what was actually saved.

| When the visitor… | Sarjy… |
|---|---|
| gives several updates in one answer | saves each as its own entry with a stable ID, then moves to the next unanswered section |
| corrects an earlier answer | revises or removes that entry by its ID |
| says "nothing blocking me" or "skip that" | records the section as `explicit_none` or `skipped`, which is different from never asked |
| names a ticket that matches more than one | saves the unresolved reference, asks which one, and blocks finish until it is resolved |
| goes off-topic | answers briefly, then returns to the unanswered section |
| disconnects | reloads the active stand-up from Postgres on the next call and resumes |
| loses a save response | retries with the same request ID so the change is never applied twice. If the result still can't be confirmed, it says so and reads the saved state before trying again |

How the state stays consistent:

- **One active stand-up per visitor**, enforced by a partial unique index.
- **Optimistic revisions.** Every command carries the revision the agent last saw. A stale command is rejected instead of overwriting a newer change.
- **Replay-safe request IDs.** Repeating a request returns its recorded result.
- **Finish belongs to the visitor.** The agent can't finish the stand-up; the browser does it after review, and only when every section is covered and every ambiguity is resolved.
- **Identity isn't taken from the model.** The browser is identified by an HttpOnly cookie. The agent is authorized by a short-lived room binding, sent by the server in LiveKit dispatch metadata, not by an ID the model or browser supplies.

## Why Linear

A stand-up is about tickets, so connecting Sarjy to the real board turns "I worked on KYC" into a specific ticket instead of loose text. It also creates the most useful workflow edge case: two tickets that sound alike, which Sarjy has to clarify instead of guessing. Once the stand-up flow was reliable, I let Sarjy propose new tickets, comments, and status changes, but only the visitor can approve them in the browser. That way a misheard sentence can't change the board on its own.

> The Linear team is a shared demo board with fictional tickets. Approved changes are visible to every visitor.

## How it fits together

```
Browser (React)                    LiveKit Cloud                      Web API (Vercel)            Postgres (Supabase)
───────────────                    ─────────────                      ────────────────            ───────────────────
cookie identity ──── /api/session ──────────────────────────────────▶ creates room + binding
participant token ◀──────────────────────────────────────────────── dispatches agent with binding
mic / speaker  ◀── WebRTC ──▶  Sarjy agent
                                STT  AssemblyAI Universal-3.5 Pro
                                LLM  Gemma 4 31B + workflow tools ─── /api/agent ──────────▶ revisioned commands ───▶ stand-up, entries,
                                TTS  Fish Audio S2.1 Pro           ── /api/memory ─────────▶ personal facts           request results,
                                                                   ── /api/agent-actions ──▶ Linear proposals         memory, proposals
saved notes, stage rail ◀── polls /api/workflow ───────────────────────────────────────────
approve proposal ─────────── /api/actions ─────────────────────────▶ writes to Linear, then verifies the outcome
```

## Repository

| Path | What's there |
|---|---|
| [`apps/web`](apps/web) | React interface and the Vercel API routes: identity, workflow, memory, LiveKit sessions, Linear |
| [`apps/sarjy-agent`](apps/sarjy-agent) | LiveKit voice agent that turns conversation into validated workflow commands |
| [`supabase/migrations`](supabase/migrations) | Schema and the SQL functions that enforce revisions, replay, isolation, and finish rules |

[`apps/README.md`](apps/README.md) covers the request flow, local setup, and checks.

## Testing

- **Web:** unit tests for the workflow, the Linear proposal service, and the UI, plus SQL integration tests against a disposable Postgres. Those check visitor isolation, revision conflicts, request replay, room binding, single approval claims, and finish rules.
- **Agent:** response validation, revision handling, retries, and proposal requests (`src/workflow.test.ts`), plus spoken acceptance scenarios in `scenarios.yaml`.
- A live call is still the final check for the voice experience.

```sh
pnpm --dir apps/web test && pnpm --dir apps/web build && pnpm --dir apps/web lint
pnpm --dir apps/sarjy-agent test && pnpm --dir apps/sarjy-agent typecheck && pnpm --dir apps/sarjy-agent lint
```
