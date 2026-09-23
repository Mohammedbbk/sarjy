import { browserContext } from './_lib/auth.js'
import { json } from './_lib/http.js'
import { checkAction, confirmAction } from './_lib/linear-action-service.js'
import { listActions } from './_lib/linear-action-store.js'
import { authError, badRequest, readJsonBody, visitorHeaders } from './_lib/responses.js'

const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export async function GET(request: Request): Promise<Response> {
  const context = await browserContext(request)
  if (!context.ok) return authError(context)
  const result = await listActions(context.visitor.id, null)
  return result.ok ? json(200, { ok: true, actions: result.data }, visitorHeaders(request, context.visitor))
    : json(503, { ok: false, error: 'storage_unavailable', message: 'Could not load proposals.' })
}

export async function POST(request: Request): Promise<Response> {
  const context = await browserContext(request, { mutating: true })
  if (!context.ok) return authError(context)
  const body = await readJsonBody(request)
  if (!body || !uuid(body.actionId) || (body.op !== 'confirm' && body.op !== 'check')) return badRequest('Choose a proposal and operation.')
  const result = body.op === 'confirm'
    ? await confirmAction(context.visitor.id, body.actionId as string)
    : await checkAction(context.visitor.id, body.actionId as string)
  return result.ok ? json(200, { ok: true, action: result.action }, visitorHeaders(request, context.visitor))
    : json(result.status, { ok: false, error: 'action_failed', message: result.message })
}
