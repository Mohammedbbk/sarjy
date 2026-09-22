import { browserContext } from './_lib/auth.js'
import { parseCommand } from './_lib/command-input.js'
import { json } from './_lib/http.js'
import { authError, badRequest, readEnvelope, readJsonBody, visitorHeaders, workflowResponse } from './_lib/responses.js'
import { finishStandup, openStandup, readSnapshot, runCommand } from './_lib/workflow-store.js'

const OPS = ['start', 'snapshot', 'command', 'finish'] as const
export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'invalid_request', message: 'Use POST.' }, { Allow: 'POST' })
  const body = await readJsonBody(request)
  if (!body || typeof body.op !== 'string' || !(OPS as readonly string[]).includes(body.op)) return badRequest('Unknown operation.')
  const context = await browserContext(request, { mutating: true })
  if (!context.ok) return authError(context)
  const headers = visitorHeaders(request, context.visitor)
  if (body.op === 'start') {
    const opened = await openStandup(context.visitor.id)
    return opened.ok ? json(200, { ok: true, snapshot: opened.snapshot, resumed: opened.resumed }, headers) : workflowResponse(opened, headers)
  }
  if (typeof body.standupId !== 'string') return badRequest('A standupId is required.')
  if (body.op === 'snapshot') return workflowResponse(await readSnapshot(context.visitor.id, body.standupId), headers)
  const envelope = readEnvelope(body)
  if (!envelope) return badRequest('Send an integer expectedRevision and a requestId.')
  if (body.op === 'finish') return workflowResponse(await finishStandup({ visitorId: context.visitor.id, standupId: body.standupId, ...envelope }), headers)
  const parsed = parseCommand(body.command)
  if (!parsed.ok) return badRequest(parsed.message)
  return workflowResponse(await runCommand({ visitorId: context.visitor.id, standupId: body.standupId, ...envelope, command: parsed.command }), headers)
}
