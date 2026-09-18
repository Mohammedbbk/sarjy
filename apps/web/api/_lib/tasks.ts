/**
 * Stand-up task lookup.
 *
 * The team is fixed by server configuration (`LINEAR_TEAM_KEY`); there is no
 * query parameter for it. Read-only: there is no write path here.
 */
import type { TasksError, TasksResponse } from '../../shared/tasks.js'
import { fetchStandupTasks, type LinearErrorCode } from './linear.js'

/**
 * How a Linear failure is reported to the caller. The detailed reason stays in
 * the server log; the browser gets a coarse code and a message safe to render.
 */
const FAILURES: Record<LinearErrorCode, { status: number; body: TasksError }> = {
  not_configured: {
    status: 500,
    body: {
      error: 'server_not_configured',
      message: 'The server is missing its Linear credentials.',
    },
  },
  team_not_found: {
    status: 500,
    body: {
      error: 'server_not_configured',
      message: 'The server’s Linear team is not configured correctly.',
    },
  },
  unauthorized: {
    status: 500,
    body: {
      error: 'server_not_configured',
      message: 'The server’s Linear credentials were rejected.',
    },
  },
  timeout: {
    status: 503,
    body: { error: 'upstream_unavailable', message: 'Linear took too long to respond.' },
  },
  network_error: {
    status: 503,
    body: { error: 'upstream_unavailable', message: 'Could not reach Linear.' },
  },
  http_error: {
    status: 502,
    body: { error: 'upstream_error', message: 'Linear returned an unexpected response.' },
  },
  graphql_error: {
    status: 502,
    body: { error: 'upstream_error', message: 'Linear rejected the task query.' },
  },
  invalid_response: {
    status: 502,
    body: { error: 'upstream_error', message: 'Linear returned an unexpected response.' },
  },
}

/**
 * Runtime-agnostic request handling, shared by the Vercel function and the Vite
 * dev server so both serve exactly the same endpoint.
 */
export async function handleTasksRequest(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return json(405, { error: 'invalid_request', message: 'Use GET.' }, { Allow: 'GET' })
  }

  const result = await fetchStandupTasks()

  if (!result.ok) {
    console.error(`[api/tasks] ${result.error}: ${result.message}`)
    const failure = FAILURES[result.error]
    return json(failure.status, failure.body)
  }

  const body: TasksResponse = {
    source: 'linear',
    teamKey: result.teamKey,
    count: result.tasks.length,
    hasMore: result.hasMore,
    tasks: result.tasks,
  }

  return json(200, body)
}

function json(
  status: number,
  body: TasksResponse | TasksError,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}
