import type { StandupSummary, WorkflowSnapshot } from '../shared/workflow.js'
import { browserContext } from './_lib/auth.js'
import { json } from './_lib/http.js'
import { authError, visitorHeaders } from './_lib/responses.js'
import { openStandup, readLastSummary } from './_lib/workflow-store.js'

export type BootstrapResponse = { ok: true; standup: WorkflowSnapshot; resumed: boolean; lastSummary: StandupSummary | null }
export async function GET(request: Request): Promise<Response> {
  const context = await browserContext(request)
  if (!context.ok) return authError(context)
  const headers = visitorHeaders(request, context.visitor)
  const [standup, previous] = await Promise.all([openStandup(context.visitor.id), readLastSummary(context.visitor.id)])
  if (!standup.ok) return json(503, { ok: false, error: standup.error, message: standup.message }, headers)
  return json(200, { ok: true, standup: standup.snapshot, resumed: standup.resumed, lastSummary: previous.ok ? previous.data : null } satisfies BootstrapResponse, headers)
}
