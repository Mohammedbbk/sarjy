
export type Task = {
  id: string
  identifier: string // SAR-4
  title: string
  status: string
  // group by this, not status: status names are per-workspace
  statusType: TaskStatusType
  // 0 none, 1 urgent, 2 high, 3 medium, 4 low
  priority: number
  priorityLabel: string
  url: string
}

// canceled issues are dropped, unknown types become 'unstarted'
export type TaskStatusType = 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed'

export const TASK_STATUS_TYPES: readonly TaskStatusType[] = [
  'triage',
  'backlog',
  'unstarted',
  'started',
  'completed',
]

export const GROUP_SIZE = 3

export type TasksResponse = {
  source: 'linear'
  teamKey: string
  done: Task[] // newest first
  inProgress: Task[] // most urgent first
  upcoming: Task[] // unstarted/backlog/triage, most urgent first
  fetchedAt: string
}

export type TasksErrorCode =
  | 'server_not_configured'
  | 'upstream_unavailable'
  | 'upstream_error'
  | 'invalid_request'

export type TasksError = {
  error: TasksErrorCode
  message: string
}
