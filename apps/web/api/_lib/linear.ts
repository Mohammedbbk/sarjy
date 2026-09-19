/**
 * Everything the app does with Linear, always for the one team in
 * `LINEAR_TEAM_KEY`:
 *
 *   fetchStandupTasks  the team's open issues (ticket rail, agent's get_tasks)
 *   updateTask         move an issue and/or comment on it (agent's update_task)
 *
 * Both follow the same pattern: call `linear()`, which throws a `LinearError`
 * on any failure, and turn that error into `{ ok: false }` once, at the end.
 * Neither exported function throws.
 *
 * Server-only: the only module that reads `LINEAR_API_KEY`. Nothing in `src/`
 * may import it.
 *
 * @see https://linear.app/developers/graphql
 */
import { TASK_STATUS_TYPES, type Task, type TaskStatusType } from '../../shared/tasks.js'

const LINEAR_API_URL = 'https://api.linear.app/graphql'
const TIMEOUT_MS = 6000

const TASK_LIMIT = 25

const CLOSED_STATE_TYPES = ['completed', 'canceled']

export type LinearErrorCode =
  | 'not_configured' // LINEAR_API_KEY or LINEAR_TEAM_KEY missing
  | 'team_not_found' // LINEAR_TEAM_KEY isn't a team in this workspace
  | 'unauthorized' // Linear rejected LINEAR_API_KEY
  | 'timeout'
  | 'network_error'
  | 'linear_error' // Linear answered, but with an error
  | 'task_not_found' // updateTask: no such issue on the team
  | 'unknown_status' // updateTask: no such workflow state on the team

export type LinearFailure = { ok: false; error: LinearErrorCode; message: string }

export type LinearTasksResult =
  | { ok: true; teamKey: string; teamName: string; tasks: Task[]; hasMore: boolean }
  | LinearFailure

export type TaskUpdate = { identifier: string; status?: string; comment?: string }

export type LinearUpdateResult = { ok: true; identifier: string; status: string } | LinearFailure

class LinearError extends Error {
  readonly code: LinearErrorCode

  constructor(code: LinearErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/** Turn a thrown `LinearError` into a result. Anything else is a bug: rethrow. */
function toFailure(error: unknown): LinearFailure {
  if (error instanceof LinearError) return { ok: false, error: error.code, message: error.message }
  throw error
}

function readConfig(env: Record<string, string | undefined>) {
  const apiKey = env.LINEAR_API_KEY?.trim()
  const teamKey = env.LINEAR_TEAM_KEY?.trim()
  if (!apiKey || !teamKey) {
    throw new LinearError(
      'not_configured',
      'LINEAR_API_KEY and LINEAR_TEAM_KEY must both be set on the server.',
    )
  }
  return { apiKey, teamKey }
}

/** Run one GraphQL request and return its `data`, or throw a `LinearError`. */
async function linear<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: apiKey },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new LinearError('timeout', `Linear did not respond within ${TIMEOUT_MS}ms.`)
    }
    throw new LinearError('network_error', 'Could not reach Linear.')
  }

  if (response.status === 401 || response.status === 403) {
    throw new LinearError('unauthorized', 'Linear rejected the API key.')
  }

  const body = (await response.json().catch(() => null)) as {
    data?: T
    errors?: { message: string }[]
  } | null
  const errors = body?.errors?.map((e) => e.message).join('; ')
  if (errors) {
    const code = /authenticat/i.test(errors) ? 'unauthorized' : 'linear_error'
    throw new LinearError(code, `Linear returned an error: ${errors}`)
  }
  if (!response.ok || !body?.data) {
    throw new LinearError('linear_error', `Linear returned HTTP ${response.status}.`)
  }
  return body.data
}

// ---------------------------------------------------------------------------
// Reading: the team's open issues
// ---------------------------------------------------------------------------

/** One request: the team itself (to check the key) and its open issues. */
const OPEN_ISSUES_QUERY = `
  query SarjyOpenIssues($teamKey: String!, $first: Int!, $closedTypes: [String!]!) {
    teams(filter: { key: { eqIgnoreCase: $teamKey } }) {
      nodes { key name }
    }
    issues(
      first: $first
      orderBy: updatedAt
      filter: {
        team: { key: { eqIgnoreCase: $teamKey } }
        state: { type: { nin: $closedTypes } }
      }
    ) {
      nodes { id identifier title priority priorityLabel url state { name type } }
      pageInfo { hasNextPage }
    }
  }
`

type IssueNode = {
  id: string
  identifier: string
  title: string
  priority: number
  priorityLabel: string
  url: string
  state: { name: string; type: string }
}

type OpenIssuesData = {
  teams: { nodes: { key: string; name: string }[] }
  issues: { nodes: IssueNode[]; pageInfo: { hasNextPage: boolean } }
}

function toTask(node: IssueNode): Task {
  const statusType = (TASK_STATUS_TYPES as readonly string[]).includes(node.state.type)
    ? (node.state.type as TaskStatusType)
    : 'unstarted'
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    status: node.state.name,
    statusType,
    priority: node.priority,
    priorityLabel: node.priorityLabel,
    url: node.url,
  }
}

/** The configured team's most recently updated open issues. */
export async function fetchStandupTasks(
  env: Record<string, string | undefined> = process.env,
): Promise<LinearTasksResult> {
  try {
    const { apiKey, teamKey } = readConfig(env)
    const data = await linear<OpenIssuesData>(apiKey, OPEN_ISSUES_QUERY, {
      teamKey,
      first: TASK_LIMIT,
      closedTypes: CLOSED_STATE_TYPES,
    })

    const team = data.teams.nodes[0]
    if (!team) {
      throw new LinearError(
        'team_not_found',
        `LINEAR_TEAM_KEY "${teamKey}" is not a team in this workspace. ` +
          'Use the prefix on ticket identifiers, like ENG in ENG-482.',
      )
    }

    return {
      ok: true,
      teamKey: team.key,
      teamName: team.name,
      tasks: data.issues.nodes.map(toTask),
      hasMore: data.issues.pageInfo.hasNextPage,
    }
  } catch (error) {
    return toFailure(error)
  }
}

// ---------------------------------------------------------------------------
// Writing: move an issue and/or comment on it
// ---------------------------------------------------------------------------

/** Finds SAR-12 as "issue number 12 on team SAR", so other teams never match. */
const FIND_ISSUE_QUERY = `
  query SarjyFindIssue($teamKey: String!, $number: Float!) {
    issues(first: 1, filter: {
      team: { key: { eqIgnoreCase: $teamKey } }
      number: { eq: $number }
    }) {
      nodes {
        id
        identifier
        state { name }
        team { states { nodes { id name } } }
      }
    }
  }
`

const SET_STATE_MUTATION = `
  mutation SarjySetState($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) { success }
  }
`

const ADD_COMMENT_MUTATION = `
  mutation SarjyComment($issueId: String!, $body: String!) {
    commentCreate(input: { issueId: $issueId, body: $body }) { success }
  }
`

type FoundIssue = {
  id: string
  identifier: string
  state: { name: string }
  team: { states: { nodes: { id: string; name: string }[] } }
}

async function findIssue(apiKey: string, teamKey: string, identifier: string) {
  const [prefix, number] = identifier.split('-')
  const onThisTeam = prefix?.toLowerCase() === teamKey.toLowerCase()
  const data = onThisTeam
    ? await linear<{ issues: { nodes: FoundIssue[] } }>(apiKey, FIND_ISSUE_QUERY, {
        teamKey,
        number: Number(number),
      })
    : null

  const issue = data?.issues.nodes[0]
  if (!issue) {
    throw new LinearError('task_not_found', `There is no ticket ${identifier} on this team.`)
  }
  return issue
}

/** Status names match case-insensitively, against this team's own workflow. */
function findState(issue: FoundIssue, status: string) {
  const states = issue.team.states.nodes
  const state = states.find((s) => s.name.toLowerCase() === status.trim().toLowerCase())
  if (!state) {
    throw new LinearError(
      'unknown_status',
      `"${status}" is not a status. Valid statuses: ${states.map((s) => s.name).join(', ')}.`,
    )
  }
  return state
}

export async function updateTask(
  { identifier, status, comment }: TaskUpdate,
  env: Record<string, string | undefined> = process.env,
): Promise<LinearUpdateResult> {
  try {
    const { apiKey, teamKey } = readConfig(env)
    const issue = await findIssue(apiKey, teamKey, identifier)
    let newStatus = issue.state.name

    if (status) {
      const state = findState(issue, status)
      await linear(apiKey, SET_STATE_MUTATION, { id: issue.id, stateId: state.id })
      newStatus = state.name
    }

    if (comment) {
      const body = `${comment}\n\n— via Sarjy`
      await linear(apiKey, ADD_COMMENT_MUTATION, { issueId: issue.id, body })
    }

    return { ok: true, identifier: issue.identifier, status: newStatus }
  } catch (error) {
    return toFailure(error)
  }
}
