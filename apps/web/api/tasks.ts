import type { TasksError, TasksResponse } from '../shared/tasks.js'
import { json } from './_lib/http.js'
import { fetchStandupTasks, type LinearErrorCode } from './_lib/linear.js'

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
  network_error: {
    status: 503,
    body: { error: 'upstream_unavailable', message: 'Could not reach Linear.' },
  },
  linear_error: {
    status: 502,
    body: { error: 'upstream_error', message: 'Linear returned an unexpected response.' },
  },

  task_not_found: {
    status: 502,
    body: { error: 'upstream_error', message: 'Linear returned an unexpected response.' },
  },
  unknown_status: {
    status: 502,
    body: { error: 'upstream_error', message: 'Linear returned an unexpected response.' },
  },
}

export async function GET(request: Request): Promise<Response> {
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
    done: result.done,
    inProgress: result.inProgress,
    upcoming: result.upcoming,
    openCount: result.openCount,
    hasMore: result.hasMore,
  }

  return json(200, body)
}
