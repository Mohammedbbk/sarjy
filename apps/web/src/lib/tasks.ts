/**
 * The ticket rail's data source: GET /api/tasks.
 *
 * The browser never talks to Linear directly; the endpoint holds the API key
 * and pins the team.
 */
import { useQuery } from '@tanstack/react-query'
import type { TasksError, TasksErrorCode, TasksResponse } from '../../shared/tasks'

export const TASKS_QUERY_KEY = ['tasks'] as const

/** A failed lookup, carrying the endpoint's code so the UI can word it. */
export class TasksRequestError extends Error {
  readonly code: TasksErrorCode | 'network_error'

  constructor(code: TasksErrorCode | 'network_error', message: string) {
    super(message)
    this.name = 'TasksRequestError'
    this.code = code
  }
}

async function fetchTasks({ signal }: { signal: AbortSignal }): Promise<TasksResponse> {
  let response: Response
  try {
    response = await fetch('/api/tasks', { signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (signal.aborted) throw error
    throw new TasksRequestError('network_error', 'Could not reach the server.')
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const failure = body as TasksError | null
    throw new TasksRequestError(
      failure?.error ?? 'upstream_error',
      failure?.message ?? 'Could not load tickets.',
    )
  }

  if (!isTasksResponse(body)) {
    throw new TasksRequestError('upstream_error', 'The server returned an unexpected response.')
  }

  return body
}

function isTasksResponse(body: unknown): body is TasksResponse {
  if (typeof body !== 'object' || body === null) return false
  const candidate = body as Partial<TasksResponse>
  return Array.isArray(candidate.tasks) && typeof candidate.count === 'number'
}

/**
 * The demo team's open tickets.
 *
 * Fetched on mount and refreshed when a stand-up starts (see `App.tsx`). No
 * `refetchInterval` and no refetch on focus: Linear is read on demand.
 */
export function useTasks() {
  return useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: fetchTasks,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) =>
      error instanceof TasksRequestError &&
      error.code !== 'server_not_configured' &&
      failureCount < 1,
  })
}
