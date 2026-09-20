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
 * Linear's workflow state categories the endpoint reports. `canceled` issues
 * are left out entirely. Anything unrecognised is normalised to `unstarted`.
 */
export type TaskStatusType = 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed'

export const TASK_STATUS_TYPES: readonly TaskStatusType[] = [
  'triage',
  'backlog',
  'unstarted',
  'started',
  'completed',
]

/** How many tickets each group holds at most. */
export const GROUP_SIZE = 3

/**
 * The stand-up at a glance: what was just finished, what is being worked on,
 * and what comes next. Each group holds at most `GROUP_SIZE` tickets.
 */
export type TasksResponse = {
  source: 'linear'
  /** The demo team's key, as Linear spells it. Fixed by server config. */
  teamKey: string
  /** Most recently completed first. */
  done: Task[]
  /** Started tickets, most urgent first. */
  inProgress: Task[]
  /** Not started yet (unstarted, backlog or triage), most urgent first. */
  upcoming: Task[]
  /** How many open tickets the team has in total, ignoring the group limit. */
  openCount: number
  /** True when there are more open tickets than the groups show. */
  hasMore: boolean
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
