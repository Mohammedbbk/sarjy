/**
 * Stand-up session creation.
 *
 * This is the only place LiveKit API credentials are read. They never reach the
 * browser: the client receives a participant token scoped to one room, and the
 * agent dispatch is decided here rather than by the caller.
 *
 * The request/response shape follows LiveKit's standard token endpoint schema,
 * so any LiveKit client SDK `TokenSource` can talk to it.
 * @see https://docs.livekit.io/frontends/build/authentication/endpoint/
 */
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol'
import { AccessToken } from 'livekit-server-sdk'

/** How long the participant token stays valid. It is only needed to join. */
const TOKEN_TTL = '10m'

/** Default dispatch name of the agent, matching `agentName` in sarjy-agent. */
const DEFAULT_AGENT_NAME = 'sarjy-agent'

export type SessionRequest = {
  /** Display name shown to other participants. Optional, never trusted for auth. */
  participant_name?: string
}

/** LiveKit's standard token endpoint response. */
export type SessionResponse = {
  server_url: string
  participant_token: string
}

/** Machine-readable failure, so the UI can show the right message and control. */
export type SessionErrorCode = 'server_not_configured' | 'invalid_request'

export type SessionError = {
  error: SessionErrorCode
  message: string
}

export class SessionConfigError extends Error {
  readonly code: SessionErrorCode = 'server_not_configured'
}

type Config = {
  url: string
  apiKey: string
  apiSecret: string
  agentName: string
  /** Empty targets the production deployment. */
  agentDeployment?: string
}

function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const url = env.LIVEKIT_URL
  const apiKey = env.LIVEKIT_API_KEY
  const apiSecret = env.LIVEKIT_API_SECRET

  const missing = [
    !url && 'LIVEKIT_URL',
    !apiKey && 'LIVEKIT_API_KEY',
    !apiSecret && 'LIVEKIT_API_SECRET',
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new SessionConfigError(`Missing environment variables: ${missing.join(', ')}`)
  }

  return {
    url: url!,
    apiKey: apiKey!,
    apiSecret: apiSecret!,
    agentName: env.SARJY_AGENT_NAME || DEFAULT_AGENT_NAME,
    agentDeployment: env.LIVEKIT_AGENT_DEPLOYMENT || undefined,
  }
}

/** Short, unique, and readable in the LiveKit dashboard. */
function uniqueSuffix(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12)
}

/**
 * Mints credentials for one stand-up: a fresh room, a fresh identity, and a
 * token that can only join that room and dispatch only our agent.
 *
 * The room name and identity are generated here rather than taken from the
 * request, so a caller cannot join someone else's stand-up.
 */
export async function createStandupSession(
  body: SessionRequest = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<SessionResponse> {
  const config = readConfig(env)

  const roomName = `standup-${uniqueSuffix()}`
  const participantIdentity = `dev-${uniqueSuffix()}`
  const participantName =
    typeof body.participant_name === 'string' && body.participant_name.trim() !== ''
      ? body.participant_name.trim().slice(0, 64)
      : 'Developer'

  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: participantIdentity,
    name: participantName,
    ttl: TOKEN_TTL,
  })

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  // Explicit dispatch: sarjy-agent sets `agentName` on its ServerOptions, so it
  // only joins rooms that ask for it by name.
  // See https://docs.livekit.io/agents/server/agent-dispatch/
  token.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: config.agentName,
        ...(config.agentDeployment ? { deployment: config.agentDeployment } : {}),
      }),
    ],
  })

  return {
    server_url: config.url,
    participant_token: await token.toJwt(),
  }
}

/**
 * Runtime-agnostic request handling, shared by the Vercel function and the Vite
 * dev server so both serve exactly the same endpoint.
 */
export async function handleSessionRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, { error: 'invalid_request', message: 'Use POST.' }, { Allow: 'POST' })
  }

  let body: SessionRequest = {}
  const raw = await request.text()
  if (raw.trim() !== '') {
    try {
      body = JSON.parse(raw) as SessionRequest
    } catch {
      return json(400, { error: 'invalid_request', message: 'Body must be JSON.' })
    }
  }

  try {
    return json(201, await createStandupSession(body))
  } catch (error) {
    if (error instanceof SessionConfigError) {
      console.error('[api/session] not configured:', error.message)
      return json(500, {
        error: 'server_not_configured',
        message:
          'The server is missing its LiveKit credentials. Check LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.',
      })
    }
    console.error('[api/session] failed to create session:', error)
    return json(500, {
      error: 'server_not_configured',
      message: 'Could not create a stand-up session. Try again.',
    })
  }
}

function json(
  status: number,
  body: SessionResponse | SessionError,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}
