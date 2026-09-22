import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk'
import { browserContext } from './_lib/auth.js'
import { rpc } from './_lib/db.js'
import { json } from './_lib/http.js'
import { authError, visitorHeaders } from './_lib/responses.js'
import { openStandup } from './_lib/workflow-store.js'

const TOKEN_TTL = '10m'
const BINDING_TTL_MINUTES = 60
const DEFAULT_AGENT_NAME = 'sarjy-agent'

type SessionResponse = {
  server_url: string
  participant_token: string
  room_name: string
  standup_id: string
}

class SessionConfigError extends Error {}

type Config = {
  url: string
  apiKey: string
  apiSecret: string
  agentName: string
  agentDeployment?: string
  apiBase?: string
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
    apiBase: env.SARJY_PUBLIC_API_URL || undefined,
  }
}

// LIVEKIT_URL is wss://, the dispatch client wants https://
function httpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws/, 'http')
}

function uniqueSuffix(): string {
  return randomUUID().replaceAll('-', '').slice(0, 12)
}

export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, { error: 'invalid_request', message: 'Use POST.' }, { Allow: 'POST' })
  }

  const context = await browserContext(request, { mutating: true })
  if (!context.ok) return authError(context)
  const headers = visitorHeaders(request, context.visitor)

  // resuming a stand-up revokes its old binding, so two agents can't overlap
  const standup = await openStandup(context.visitor.id)
  if (!standup.ok) {
    return json(503, { error: 'storage_unavailable', message: standup.message }, headers)
  }

  let config: Config
  try {
    config = readConfig()
  } catch (error) {
    console.error('[api/session] not configured:', (error as Error).message)
    return json(
      500,
      {
        error: 'server_not_configured',
        message:
          'The server is missing its LiveKit credentials. Check LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.',
      },
      headers,
    )
  }

  const roomName = `standup-${uniqueSuffix()}`
  const bindingToken = randomBytes(32).toString('base64url')

  const bound = await rpc<boolean>('sarjy_bind_room', {
    p_visitor_id: context.visitor.id,
    p_standup_id: standup.snapshot.standupId,
    p_room_name: roomName,
    p_token_hash: createHash('sha256').update(bindingToken).digest('hex'),
    p_expires_at: new Date(Date.now() + BINDING_TTL_MINUTES * 60_000).toISOString(),
  })
  if (!bound.ok || !bound.data) {
    return json(
      503,
      { error: 'storage_unavailable', message: 'Could not start a voice session. Try again.' },
      headers,
    )
  }

  try {
    // the binding token goes in dispatch metadata, which only the worker sees.
    // don't put it in the participant token, the browser can decode that.
    const dispatcher = new AgentDispatchClient(
      httpUrl(config.url),
      config.apiKey,
      config.apiSecret,
    )
    await dispatcher.createDispatch(roomName, config.agentName, {
      metadata: JSON.stringify({
        bindingToken,
        room: roomName,
        ...(config.apiBase ? { apiBase: config.apiBase } : {}),
      }),
      ...(config.agentDeployment ? { deployment: config.agentDeployment } : {}),
    })
  } catch (error) {
    console.error('[api/session] dispatch failed:', error)
    return json(
      502,
      { error: 'agent_unavailable', message: 'Sarjy could not be brought into the room.' },
      headers,
    )
  }

  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: `visitor-${uniqueSuffix()}`,
    name: 'Developer',
    ttl: TOKEN_TTL,
  })
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  const body: SessionResponse = {
    server_url: config.url,
    participant_token: await token.toJwt(),
    room_name: roomName,
    standup_id: standup.snapshot.standupId,
  }

  return json(201, body, headers)
}
