/**
 * Read-only Linear lookup. Server-only: the only module that reads
 * `LINEAR_API_KEY` and `LINEAR_TEAM_KEY`. Nothing in `src/` may import it.
 *
 * @see https://linear.app/developers/graphql
 */
import { TASK_STATUS_TYPES, type Task, type TaskStatusType } from '../../shared/tasks.js'

/** Linear's GraphQL endpoint. */
const LINEAR_API_URL = 'https://api.linear.app/graphql'

/** Hard ceiling on how many issues one lookup returns. */
const TASK_LIMIT = 25

/** Total budget for a lookup, shared across both requests. */
const TIMEOUT_MS = 6000

/**
 * Workflow state types that mean "not live work any more".
 * Linear spells it `canceled`, with one L.
 */
const CLOSED_STATE_TYPES = ['completed', 'canceled']

/** How many team keys to name back when `LINEAR_TEAM_KEY` doesn't match one. */
const MAX_KEYS_IN_ERROR = 20

/** Why a lookup failed. Distinguishes misconfiguration from a broken call. */
export type LinearErrorCode =
  | 'not_configured'
  | 'team_not_found'
  | 'unauthorized'
  | 'timeout'
  | 'http_error'
  | 'graphql_error'
  | 'invalid_response'
  | 'network_error'

export type LinearTasksResult =
  | {
      ok: true
      /** The team's real key as Linear spells it, not the configured casing. */
      teamKey: string
      teamName: string
      /** Up to `TASK_LIMIT` issues. Empty is a valid, successful answer. */
      tasks: Task[]
      /** True when the team has further open issues beyond the ones returned. */
      hasMore: boolean
    }
  | { ok: false; error: LinearErrorCode; message: string }

type GraphQLResponse<T> = {
  data?: T | null
  errors?: { message?: string }[] | null
}

type TeamsData = {
  teams: {
    nodes: { id: string; key: string; name: string }[]
    pageInfo: { hasNextPage: boolean }
  }
}

type IssueNode = {
  id: string
  identifier: string
  title: string
  priority: number
  priorityLabel: string
  url: string
  state: { name: string; type: string } | null
}

type IssuesData = {
  issues: {
    nodes: IssueNode[]
    pageInfo: { hasNextPage: boolean }
  }
}

const TEAMS_QUERY = `
  query SarjyTeams($first: Int!) {
    teams(first: $first, includeArchived: false) {
      nodes { id key name }
      pageInfo { hasNextPage }
    }
  }
`

const ISSUES_QUERY = `
  query SarjyOpenIssues($teamId: ID!, $first: Int!, $closedTypes: [String!]!) {
    issues(
      first: $first
      includeArchived: false
      orderBy: updatedAt
      filter: {
        team: { id: { eq: $teamId } }
        state: { type: { nin: $closedTypes } }
      }
    ) {
      nodes {
        id
        identifier
        title
        priority
        priorityLabel
        url
        state { name type }
      }
      pageInfo { hasNextPage }
    }
  }
`

/** Failure shape used internally while a request is still being unwrapped. */
type RequestFailure = { ok: false; error: LinearErrorCode; message: string }

function fail(error: LinearErrorCode, message: string): RequestFailure {
  return { ok: false, error, message }
}

/**
 * Issue one GraphQL request and unwrap it.
 *
 * `errors` is checked on every response: Linear returns query-level errors
 * under HTTP 200.
 */
async function request<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ ok: true; data: T } | RequestFailure> {
  let response: Response
  try {
    response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({ query, variables }),
      signal,
    })
  } catch (error) {
    if (signal.aborted) {
      return fail('timeout', `Linear did not respond within ${TIMEOUT_MS}ms.`)
    }
    const detail = error instanceof Error ? error.message : 'unknown error'
    return fail('network_error', `Could not reach Linear: ${detail}.`)
  }

  if (response.status === 401 || response.status === 403) {
    return fail(
      'unauthorized',
      `Linear rejected the API key (HTTP ${response.status}). ` +
        'It may be revoked, or lack access to this workspace.',
    )
  }

  let body: GraphQLResponse<T>
  try {
    body = (await response.json()) as GraphQLResponse<T>
  } catch {
    if (!response.ok) {
      return fail('http_error', `Linear returned HTTP ${response.status}.`)
    }
    return fail('invalid_response', 'Linear returned a body that was not JSON.')
  }

  if (body.errors?.length) {
    const detail = body.errors
      .map((e) => e.message)
      .filter((m): m is string => Boolean(m))
      .join('; ')
    if (/authenticat|unauthoriz|invalid api key/i.test(detail)) {
      return fail('unauthorized', `Linear rejected the API key: ${detail}`)
    }
    return fail('graphql_error', `Linear returned an error: ${detail || 'no detail given'}.`)
  }

  if (!response.ok) {
    return fail('http_error', `Linear returned HTTP ${response.status}.`)
  }

  if (!body.data) {
    return fail('invalid_response', 'Linear returned a response with no data.')
  }

  return { ok: true, data: body.data }
}

/**
 * Explain a team-key mismatch without guessing at a replacement.
 *
 * Names the workspace's teams, so it is for the server log only.
 */
function teamNotFoundMessage(
  configured: string,
  teams: { key: string; name: string }[],
  truncated: boolean,
): string {
  const known = teams.slice(0, MAX_KEYS_IN_ERROR).map((t) => `${t.key} (${t.name})`)
  const suffix = truncated || teams.length > MAX_KEYS_IN_ERROR ? ', and others not listed here' : ''

  if (known.length === 0) {
    return (
      `LINEAR_TEAM_KEY is set to "${configured}", but this API key can't see any teams. ` +
      `Check that the key belongs to the right workspace.`
    )
  }

  return (
    `LINEAR_TEAM_KEY is set to "${configured}", which is not a team key in this workspace. ` +
    `A team key is the short prefix on ticket identifiers, like the "ENG" in ENG-482 — ` +
    `not the team's display name and not the workspace slug from the Linear URL. ` +
    `Accessible team keys: ${known.join(', ')}${suffix}. ` +
    `Update LINEAR_TEAM_KEY in the web app's environment to one of those.`
  )
}

/**
 * Narrow Linear's free-form state type to the categories the UI styles.
 * Anything unrecognised falls back to `unstarted`; `status` keeps the real name.
 */
function toStatusType(type: string): TaskStatusType {
  return (TASK_STATUS_TYPES as readonly string[]).includes(type)
    ? (type as TaskStatusType)
    : 'unstarted'
}

function mapTask(node: IssueNode): Task | null {
  if (!node.id || !node.identifier || !node.state) return null
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    status: node.state.name,
    statusType: toStatusType(node.state.type),
    priority: node.priority,
    priorityLabel: node.priorityLabel,
    url: node.url,
  }
}

/**
 * Look up the configured team's open issues.
 *
 * The team comes from server configuration only; there is no parameter for it.
 * Never throws — every failure path returns `{ ok: false }` with a code.
 */
export async function fetchStandupTasks(
  env: Record<string, string | undefined> = process.env,
): Promise<LinearTasksResult> {
  const apiKey = env.LINEAR_API_KEY?.trim()
  const configuredKey = env.LINEAR_TEAM_KEY?.trim()

  const missing = [
    apiKey ? null : 'LINEAR_API_KEY',
    configuredKey ? null : 'LINEAR_TEAM_KEY',
  ].filter((name): name is string => name !== null)

  if (missing.length > 0 || !apiKey || !configuredKey) {
    return {
      ok: false,
      error: 'not_configured',
      message:
        `Linear is not configured: ${missing.join(' and ')} ` +
        `${missing.length > 1 ? 'are' : 'is'} missing from the server environment.`,
    }
  }

  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const teamsResult = await request<TeamsData>(
      apiKey,
      TEAMS_QUERY,
      { first: 250 },
      controller.signal,
    )
    if (!teamsResult.ok) return teamsResult

    const teams = teamsResult.data.teams?.nodes ?? []
    const wanted = configuredKey.toLowerCase()
    const team = teams.find((t) => t.key?.toLowerCase() === wanted)

    if (!team) {
      return {
        ok: false,
        error: 'team_not_found',
        message: teamNotFoundMessage(
          configuredKey,
          teams,
          teamsResult.data.teams?.pageInfo?.hasNextPage ?? false,
        ),
      }
    }

    const issuesResult = await request<IssuesData>(
      apiKey,
      ISSUES_QUERY,
      { teamId: team.id, first: TASK_LIMIT, closedTypes: CLOSED_STATE_TYPES },
      controller.signal,
    )
    if (!issuesResult.ok) return issuesResult

    const nodes = issuesResult.data.issues?.nodes ?? []
    const tasks: Task[] = []
    for (const node of nodes) {
      const task = mapTask(node)
      if (!task) {
        return {
          ok: false,
          error: 'invalid_response',
          message: 'Linear returned an issue without an identifier or workflow state.',
        }
      }
      tasks.push(task)
    }

    return {
      ok: true,
      teamKey: team.key,
      teamName: team.name,
      tasks,
      hasMore: issuesResult.data.issues?.pageInfo?.hasNextPage ?? false,
    }
  } finally {
    clearTimeout(deadline)
  }
}
