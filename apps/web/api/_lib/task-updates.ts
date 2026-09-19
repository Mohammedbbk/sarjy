
import process from 'node:process'
import { hasBearerToken } from './auth.js'
import { updateTask } from './linear.js'

export async function handleTaskUpdateRequest(request: Request): Promise<Response> {
  if (!hasBearerToken(request, process.env.MEMORY_API_TOKEN)) {
    return reply(401, { ok: false, error: 'unauthorized', message: 'Access denied.' })
  }
  if (process.env.LINEAR_WRITES_ENABLED?.trim() !== 'true') {
    return reply(403, {
      ok: false,
      error: 'writes_disabled',
      message: 'Ticket updates are turned off on this server.',
    })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : ''
  const status = typeof body?.status === 'string' ? body.status.trim() : ''
  const comment = typeof body?.comment === 'string' ? body.comment.trim() : ''
  if (!/^[A-Za-z]+-\d+$/.test(identifier) || (!status && !comment) || comment.length > 1000) {
    return reply(400, {
      ok: false,
      error: 'invalid_input',
      message: 'Send an identifier like SAR-12 plus a status and/or a comment (max 1000 chars).',
    })
  }

  const result = await updateTask({ identifier, status, comment })
  console.log(`[api/task-updates] ${identifier}: ${result.ok ? `now ${result.status}` : result.error}`)
  return reply(result.ok ? 200 : 400, result)
}

function reply(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
