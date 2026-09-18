/**
 * The GET /api/tasks contract.
 *
 * Types only. Imported by the browser bundle, so it must never import anything
 * that reads credentials.
 */

/** One Linear issue, as the endpoint reports it. */
export type Task = {
  /** Linear's internal UUID. Never displayed and never spoken. */
  id: string
  /** Human-readable ticket reference, e.g. `SAR-4`. This is what users say. */
  identifier: string
  title: string
  /** Workflow state name as configured in the workspace, e.g. `In Progress`. */
  status: string
  /** Workflow state category. Stable across workspaces, unlike `status`. */
  statusType: TaskStatusType
  /** Linear's numeric priority: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
  priority: number
  /** Priority rendered by Linear, e.g. `High`. */
  priorityLabel: string
  url: string
}

/**
 * Linear's workflow state categories, minus the closed ones the endpoint
 * filters out. Anything unrecognised is normalised to `unstarted`.
 */
export type TaskStatusType = 'triage' | 'backlog' | 'unstarted' | 'started'

export const TASK_STATUS_TYPES: readonly TaskStatusType[] = [
  'triage',
  'backlog',
  'unstarted',
  'started',
]

export type TasksResponse = {
  source: 'linear'
  /** The demo team's key, as Linear spells it. Fixed by server config. */
  teamKey: string
  /** Number of tasks in `tasks`. Always equal to `tasks.length`. */
  count: number
  /** True when the team has further open issues beyond the ones returned. */
  hasMore: boolean
  tasks: Task[]
}

/**
 * Machine-readable failure, so the UI can pick the right message and control.
 *
 * Deliberately coarse: the detailed reason stays in the server log.
 */
export type TasksErrorCode =
  | 'server_not_configured'
  | 'upstream_unavailable'
  | 'upstream_error'
  | 'invalid_request'

export type TasksError = {
  error: TasksErrorCode
  message: string
}
