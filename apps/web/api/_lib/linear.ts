
import {
  LinearClient,
  LinearError,
  LinearErrorType,
  PaginationOrderBy,
  type Issue,
  type Team,
  type WorkflowState,
} from '@linear/sdk'
import { TASK_STATUS_TYPES, type Task, type TaskStatusType } from '../../shared/tasks.js'

const TASK_LIMIT = 25

const CLOSED_STATE_TYPES = ['completed', 'canceled']

export type LinearErrorCode =
  | 'not_configured' // LINEAR_API_KEY or LINEAR_TEAM_KEY missing
  | 'team_not_found' // LINEAR_TEAM_KEY isn't a team in this workspace
  | 'unauthorized' // Linear rejected LINEAR_API_KEY
  | 'network_error' // couldn't reach Linear
  | 'linear_error' // Linear answered, but with an error
  | 'task_not_found' // updateTask: no such issue on the team
  | 'unknown_status' // updateTask: no such workflow state on the team

export type LinearFailure = { ok: false; error: LinearErrorCode; message: string }

export type LinearTasksResult =
  | { ok: true; teamKey: string; teamName: string; tasks: Task[]; hasMore: boolean }
  | LinearFailure

export type TaskUpdate = { identifier: string; status?: string; comment?: string }

export type LinearUpdateResult = { ok: true; identifier: string; status: string } | LinearFailure

class TaskError extends Error {
  readonly code: LinearErrorCode

  constructor(code: LinearErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function toFailure(error: unknown): LinearFailure {
  if (error instanceof TaskError) {
    return { ok: false, error: error.code, message: error.message }
  }
  if (error instanceof LinearError) {
    const code =
      error.type === LinearErrorType.AuthenticationError ||
      error.type === LinearErrorType.Forbidden
        ? 'unauthorized'
        : error.type === LinearErrorType.NetworkError
          ? 'network_error'
          : 'linear_error'
    return { ok: false, error: code, message: `Linear: ${error.message}` }
  }
  throw error
}

/** Connect with the server's API key and find the configured team. */
async function openTeam(env: Record<string, string | undefined>) {
  const apiKey = env.LINEAR_API_KEY?.trim()
  const teamKey = env.LINEAR_TEAM_KEY?.trim()
  if (!apiKey || !teamKey) {
    throw new TaskError(
      'not_configured',
      'LINEAR_API_KEY and LINEAR_TEAM_KEY must both be set on the server.',
    )
  }

  const client = new LinearClient({ apiKey })
  const teams = await client.teams({ filter: { key: { eqIgnoreCase: teamKey } } })
  const team = teams.nodes[0]
  if (!team) {
    throw new TaskError(
      'team_not_found',
      `LINEAR_TEAM_KEY "${teamKey}" is not a team in this workspace. ` +
        'Use the prefix on ticket identifiers, like ENG in ENG-482.',
    )
  }
  return { client, team }
}

// ---------------------------------------------------------------------------
// Reading: the team's open issues
// ---------------------------------------------------------------------------

function toTask(issue: Issue, states: WorkflowState[]): Task {
  // Look the state up in the team's list rather than `await issue.state`,
  // which would cost one request per issue.
  const state = states.find((s) => s.id === issue.stateId)
  // Styling is keyed on the state category; anything unexpected looks "unstarted".
  const statusType = (TASK_STATUS_TYPES as readonly string[]).includes(state?.type ?? '')
    ? (state!.type as TaskStatusType)
    : 'unstarted'
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    status: state?.name ?? 'Unknown',
    statusType,
    priority: issue.priority,
    priorityLabel: issue.priorityLabel,
    url: issue.url,
  }
}

/** The configured team's most recently updated open issues. */
export async function fetchStandupTasks(
  env: Record<string, string | undefined> = process.env,
): Promise<LinearTasksResult> {
  try {
    const { team } = await openTeam(env)
    const [issues, states] = await Promise.all([
      team.issues({
        first: TASK_LIMIT,
        orderBy: PaginationOrderBy.UpdatedAt,
        filter: { state: { type: { nin: CLOSED_STATE_TYPES } } },
      }),
      team.states(),
    ])

    return {
      ok: true,
      teamKey: team.key,
      teamName: team.name,
      tasks: issues.nodes.map((issue) => toTask(issue, states.nodes)),
      hasMore: issues.pageInfo.hasNextPage,
    }
  } catch (error) {
    return toFailure(error)
  }
}

// ---------------------------------------------------------------------------
// Writing: move an issue and/or comment on it
// ---------------------------------------------------------------------------

/** Finds SAR-12 as "issue number 12 on team SAR", so other teams never match. */
async function findIssue(team: Team, identifier: string) {
  const [prefix, number] = identifier.split('-')
  const onThisTeam = prefix?.toLowerCase() === team.key.toLowerCase()
  const issues = onThisTeam
    ? await team.issues({ first: 1, filter: { number: { eq: Number(number) } } })
    : null

  const issue = issues?.nodes[0]
  if (!issue) {
    throw new TaskError('task_not_found', `There is no ticket ${identifier} on this team.`)
  }
  return issue
}

/** Status names match case-insensitively, against this team's own workflow. */
function findState(states: WorkflowState[], status: string) {
  const state = states.find((s) => s.name.toLowerCase() === status.trim().toLowerCase())
  if (!state) {
    throw new TaskError(
      'unknown_status',
      `"${status}" is not a status. Valid statuses: ${states.map((s) => s.name).join(', ')}.`,
    )
  }
  return state
}

/** Move an issue to another status and/or comment on it. */
export async function updateTask(
  { identifier, status, comment }: TaskUpdate,
  env: Record<string, string | undefined> = process.env,
): Promise<LinearUpdateResult> {
  try {
    const { client, team } = await openTeam(env)
    const issue = await findIssue(team, identifier)
    const states = (await team.states()).nodes
    let newStatus = states.find((s) => s.id === issue.stateId)?.name ?? 'Unknown'

    if (status) {
      const state = findState(states, status)
      await issue.update({ stateId: state.id })
      newStatus = state.name
    }

    if (comment) {
      await client.createComment({ issueId: issue.id, body: `${comment}\n\n— via Sarjy` })
    }

    return { ok: true, identifier: issue.identifier, status: newStatus }
  } catch (error) {
    return toFailure(error)
  }
}
