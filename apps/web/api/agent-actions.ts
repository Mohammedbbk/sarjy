import { agentContext } from './_lib/auth.js'
import { json } from './_lib/http.js'
import { parseProposal, proposeAction } from './_lib/linear-action-service.js'
import { authError, badRequest, readJsonBody } from './_lib/responses.js'

export async function POST(request: Request): Promise<Response> {
  const context = await agentContext(request)
  if (!context.ok) return authError(context)
  const body = await readJsonBody(request)
  const input = body && parseProposal(body)
  if (!input) return badRequest('Send one new-ticket, comment, or status proposal for a saved update.')
  const result = await proposeAction(context.visitorId, context.standupId, input)
  return result.ok ? json(200, { ok: true, action: result.action })
    : json(result.status, { ok: false, error: 'proposal_failed', message: result.message })
}
