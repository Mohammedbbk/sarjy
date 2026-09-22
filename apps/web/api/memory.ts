import { agentContext } from './_lib/auth.js'
import { json } from './_lib/http.js'
import { getFacts, saveFact } from './_lib/memory-store.js'
import { authError } from './_lib/responses.js'

async function handleRequest(request: Request): Promise<Response> {
  const context = await agentContext(request)
  if (!context.ok) return authError(context)

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json(
      405,
      { ok: false, error: 'invalid_request', message: 'Use GET or POST.' },
      { Allow: 'GET, POST' },
    )
  }
  if (new URL(request.url).search) {
    return json(400, {
      ok: false,
      error: 'invalid_input',
      message: 'Query parameters are not supported.',
    })
  }

  let result
  if (request.method === 'GET') {
    result = await getFacts(context.visitorId)
  } else {
    let body: unknown
    try {
      const raw = await request.text()
      if (raw.length > 8192) throw new Error('body too large')
      body = JSON.parse(raw)
    } catch {
      return json(400, {
        ok: false,
        error: 'invalid_input',
        message: 'Expected a small JSON object with key and value.',
      })
    }
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== 'key' && key !== 'value')
    ) {
      return json(400, {
        ok: false,
        error: 'invalid_input',
        message: 'Only key and value are accepted.',
      })
    }
    const input = body as Record<string, unknown>
    result = await saveFact(context.visitorId, input.key, input.value)
  }
  return json(result.ok ? 200 : result.error === 'invalid_input' ? 400 : 503, result)
}

export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
export const HEAD = handleRequest
export const OPTIONS = handleRequest
