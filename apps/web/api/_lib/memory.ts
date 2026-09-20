import process from 'node:process'
import { hasBearerToken } from './auth.js'
import { getFacts, saveFact } from './memory-store.js'

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  })
}

export async function handleMemoryRequest(request: Request): Promise<Response> {
  if (!hasBearerToken(request, process.env.MEMORY_API_TOKEN)) {
    return json(401, {
      ok: false,
      error: 'unauthorized',
      message: 'Memory access denied.',
    })
  }
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
    result = await getFacts()
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
    result = await saveFact(input.key, input.value)
  }
  return json(
    result.ok ? 200 : result.error === 'invalid_input' ? 400 : 503,
    result,
  )
}
