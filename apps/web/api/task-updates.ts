import process from 'node:process'
import { hasBearerToken } from './_lib/auth.js'
import { json } from './_lib/http.js'
import { updateTask } from './_lib/linear.js'

export async function POST(request: Request): Promise<Response> {
  if (!hasBearerToken(request, process.env.MEMORY_API_TOKEN)) {
    return json(401, { ok: false, error: 'unauthorized', message: 'Access denied.' })
  }
  if (process.env.LINEAR_WRITES_ENABLED?.trim() !== 'true') {
    return json(403, {
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
    return json(400, {
      ok: false,
      error: 'invalid_input',
      message: 'Send an identifier like SAR-12 plus a status and/or a comment (max 1000 chars).',
    })
  }

  const result = await updateTask({ identifier, status, comment })
  console.log(`[api/task-updates] ${identifier}: ${result.ok ? `now ${result.status}` : result.error}`)
  return json(result.ok ? 200 : 400, result)
}
