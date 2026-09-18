/**
 * Talking to our own `POST /api/session` endpoint.
 *
 * The browser never sees a LiveKit API key: it asks our server for a token that
 * is scoped to one room and already carries the sarjy-agent dispatch. The
 * endpoint follows LiveKit's standard token endpoint schema, so it would work
 * with `TokenSource.endpoint('/api/session')` too — we wrap it in
 * `TokenSource.custom` only so failures arrive as typed errors the UI can act
 * on instead of a flattened string.
 *
 * @see https://docs.livekit.io/frontends/build/authentication/endpoint/
 */
import { MediaDeviceFailure, TokenSource } from 'livekit-client'

const SESSION_ENDPOINT = '/api/session'

/** Every way a stand-up can fail to get going, with a UI message for each. */
export type StandupErrorKind =
  | 'microphone-denied'
  | 'microphone-unavailable'
  | 'agent-unavailable'
  | 'server-not-configured'
  | 'connection-failed'

export type StandupError = {
  kind: StandupErrorKind
  /** What went wrong, in the user's terms. */
  message: string
  /** What to do about it. */
  hint?: string
  /** Raw cause, shown in small print for debugging. */
  detail?: string
}

/** A non-2xx answer from our endpoint. */
class SessionEndpointError extends Error {
  readonly kind: StandupErrorKind
  readonly detail?: string

  constructor(kind: StandupErrorKind, message: string, detail?: string) {
    super(message)
    this.name = 'SessionEndpointError'
    this.kind = kind
    this.detail = detail
  }
}

type SessionResponseBody = { server_url?: string; participant_token?: string }
type SessionErrorBody = { error?: string; message?: string }

/**
 * Asks the server for a room. `TokenSource.custom` keeps the SDK's caching and
 * refresh behaviour — including fetching a brand new room after a disconnect,
 * which matters because an agent will not rejoin a room it has already left.
 */
export const tokenSource = TokenSource.custom(async () => {
  let response: Response
  try {
    response = await fetch(SESSION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
  } catch (cause) {
    throw new SessionEndpointError(
      'connection-failed',
      'Could not reach the Sarjy API.',
      cause instanceof Error ? cause.message : undefined,
    )
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as SessionErrorBody | null
    throw new SessionEndpointError(
      body?.error === 'server_not_configured' ? 'server-not-configured' : 'connection-failed',
      body?.message ?? `The session endpoint answered ${response.status}.`,
      `POST ${SESSION_ENDPOINT} → ${response.status}`,
    )
  }

  const body = (await response.json()) as SessionResponseBody
  if (!body.server_url || !body.participant_token) {
    throw new SessionEndpointError(
      'server-not-configured',
      'The session endpoint returned an incomplete response.',
    )
  }

  return { serverUrl: body.server_url, participantToken: body.participant_token }
})

/**
 * Turns whatever `session.start()` rejected with into something we can show.
 * Microphone failures surface as `MediaDeviceFailure`; everything else is
 * either one of our endpoint errors or a connection problem.
 */
export function describeStartError(error: unknown): StandupError {
  if (error instanceof SessionEndpointError) {
    return {
      kind: error.kind,
      message: error.message,
      hint:
        error.kind === 'server-not-configured'
          ? 'Check the LiveKit variables in the web app’s .env.local, then restart the dev server.'
          : 'Check your network connection and try again.',
      detail: error.detail,
    }
  }

  const deviceFailure = MediaDeviceFailure.getFailure(error)
  if (deviceFailure) return describeMicrophoneFailure(deviceFailure)

  return {
    kind: 'connection-failed',
    message: 'Could not connect to the stand-up room.',
    hint: 'Check your network connection and try again.',
    detail: error instanceof Error ? error.message : String(error),
  }
}

/** Shared by start-up failures and microphone errors raised mid-call. */
export function describeMicrophoneFailure(failure: MediaDeviceFailure): StandupError {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return {
        kind: 'microphone-denied',
        message: 'Sarjy needs your microphone to run a stand-up.',
        hint: 'Allow microphone access for this site in your browser, then try again.',
      }
    case MediaDeviceFailure.NotFound:
      return {
        kind: 'microphone-unavailable',
        message: 'No microphone was found.',
        hint: 'Plug in or select an input device, then try again.',
      }
    case MediaDeviceFailure.DeviceInUse:
      return {
        kind: 'microphone-unavailable',
        message: 'Your microphone is already in use by another app.',
        hint: 'Close the other app using it, then try again.',
      }
    default:
      return {
        kind: 'microphone-unavailable',
        message: 'Your microphone could not be started.',
        hint: 'Check your input device settings and try again.',
      }
  }
}

/** The agent was dispatched but never took the call. */
export function agentUnavailableError(reasons: readonly string[] | null): StandupError {
  return {
    kind: 'agent-unavailable',
    message: 'Sarjy did not join the stand-up.',
    hint: 'Make sure the agent is running (`pnpm dev` in apps/sarjy-agent), then try again.',
    detail: reasons && reasons.length > 0 ? reasons.join(' · ') : undefined,
  }
}

/** The room dropped while the stand-up was running. */
export function connectionLostError(): StandupError {
  return {
    kind: 'connection-failed',
    message: 'The connection to the stand-up room dropped.',
    hint: 'Check your network connection and start again.',
  }
}
