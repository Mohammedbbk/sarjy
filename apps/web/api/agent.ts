import { agentContext, type AgentContext } from './_lib/auth.js'
import { parseCommand } from './_lib/command-input.js'
import { json } from './_lib/http.js'
import { fetchDemoTasks } from './_lib/linear.js'
import { getFacts } from './_lib/memory-store.js'
import { authError, badRequest, readEnvelope, readJsonBody, workflowResponse } from './_lib/responses.js'
import { readLastSummary, readSnapshot, runCommand } from './_lib/workflow-store.js'

export async function GET(request: Request): Promise<Response> {
  const context = await agentContext(request)
  if (!context.ok) return authError(context)
  return standupContext(context)
}
async function standupContext(context: AgentContext): Promise<Response> {
  const [snapshot, tasks, facts, previous] = await Promise.all([readSnapshot(context.visitorId, context.standupId), fetchDemoTasks(), getFacts(context.visitorId), readLastSummary(context.visitorId)])
  if (!snapshot.ok) return workflowResponse(snapshot)
  return json(200, { ok: true, snapshot: snapshot.snapshot,
    tasks: tasks.ok ? { ok: true, teamKey: tasks.teamKey, done: tasks.done, inProgress: tasks.inProgress, upcoming: tasks.upcoming } : tasks,
    memory: facts.ok ? { ok: true, facts: facts.facts } : facts,
    lastSummary: previous.ok ? { ok: true, summary: previous.data } : previous })
}
export async function POST(request: Request): Promise<Response> {
  const context = await agentContext(request)
  if (!context.ok) return authError(context)
  const body = await readJsonBody(request)
  if (!body) return badRequest('Expected a small JSON object.')
  const envelope = readEnvelope(body)
  if (!envelope) return badRequest('Send an integer expectedRevision and a requestId.')
  const parsed = parseCommand(body.command)
  if (!parsed.ok) return badRequest(parsed.message)
  return workflowResponse(await runCommand({ visitorId: context.visitorId, standupId: context.standupId, expectedRevision: envelope.expectedRevision, requestId: envelope.requestId, command: parsed.command }))
}
