import type { TasksError, TasksResponse } from '../shared/tasks.js'
import { browserContext } from './_lib/auth.js'
import { json } from './_lib/http.js'
import { fetchDemoTasks, type LinearErrorCode } from './_lib/linear.js'
import { authError, visitorHeaders } from './_lib/responses.js'

const FAILURES: Record<LinearErrorCode, { status: number; body: TasksError }> = {
  not_configured: { status: 500, body: { error: 'server_not_configured', message: 'The server is missing its Linear credentials.' } },
  team_not_found: { status: 500, body: { error: 'server_not_configured', message: 'The demo Linear team is not configured correctly.' } },
  unauthorized: { status: 500, body: { error: 'server_not_configured', message: 'The Linear credentials were rejected.' } },
  network_error: { status: 503, body: { error: 'upstream_unavailable', message: 'Could not reach Linear.' } },
  linear_error: { status: 502, body: { error: 'upstream_error', message: 'Linear returned an unexpected response.' } },
}
export async function GET(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json(405, { error: 'invalid_request', message: 'Use GET.' }, { Allow: 'GET' })
  const context = await browserContext(request)
  if (!context.ok) return authError(context)
  const headers = visitorHeaders(request, context.visitor)
  const result = await fetchDemoTasks()
  if (!result.ok) { const item = FAILURES[result.error]; return json(item.status, item.body, headers) }
  return json(200, { source: 'linear', teamKey: result.teamKey, done: result.done, inProgress: result.inProgress, upcoming: result.upcoming, fetchedAt: result.fetchedAt } satisfies TasksResponse, headers)
}
