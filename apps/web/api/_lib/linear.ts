import { LinearClient, LinearError, LinearErrorType, PaginationOrderBy, type Issue, type WorkflowState } from '@linear/sdk'
import { GROUP_SIZE, TASK_STATUS_TYPES, type Task, type TaskStatusType } from '../../shared/tasks.js'

const READ_LIMIT = 25
export type LinearErrorCode = 'not_configured' | 'team_not_found' | 'unauthorized' | 'network_error' | 'linear_error'
export type LinearFailure = { ok: false; error: LinearErrorCode; message: string }

class TaskError extends Error {
  readonly code: LinearErrorCode
  constructor(code: LinearErrorCode, message: string) { super(message); this.code = code }
}

function failure(error: unknown): LinearFailure {
  if (error instanceof TaskError) return { ok: false, error: error.code, message: error.message }
  if (error instanceof LinearError) {
    const code = error.type === LinearErrorType.AuthenticationError || error.type === LinearErrorType.Forbidden
      ? 'unauthorized' : error.type === LinearErrorType.NetworkError ? 'network_error' : 'linear_error'
    return { ok: false, error: code, message: `Linear: ${error.message}` }
  }
  throw error
}

async function openTeam(env: Record<string, string | undefined>) {
  const apiKey = env.LINEAR_API_KEY?.trim()
  const teamKey = env.LINEAR_TEAM_KEY?.trim()
  if (!apiKey || !teamKey) throw new TaskError('not_configured', 'LINEAR_API_KEY and LINEAR_TEAM_KEY must both be set.')
  const client = new LinearClient({ apiKey })
  const teams = await client.teams({ filter: { key: { eqIgnoreCase: teamKey } } })
  const team = teams.nodes[0]
  if (!team) throw new TaskError('team_not_found', `No Linear team uses key ${teamKey}.`)
  return { client, team }
}

function toTask(issue: Issue, states: WorkflowState[]): Task {
  const state = states.find((item) => item.id === issue.stateId)
  const statusType = (TASK_STATUS_TYPES as readonly string[]).includes(state?.type ?? '')
    ? state!.type as TaskStatusType : 'unstarted'
  return { id: issue.id, identifier: issue.identifier, title: issue.title, status: state?.name ?? 'Unknown', statusType,
    priority: issue.priority, priorityLabel: issue.priorityLabel, url: issue.url }
}

const byPriority = (a: Task, b: Task) => (a.priority || 5) - (b.priority || 5)
export type DemoTasksResult = ({ ok: true; teamKey: string; teamName: string; done: Task[]; inProgress: Task[]; upcoming: Task[]; statusNames: string[]; fetchedAt: string }) | LinearFailure

export async function fetchDemoTasks(env: Record<string, string | undefined> = process.env): Promise<DemoTasksResult> {
  try {
    const { team } = await openTeam(env)
    const [issues, states] = await Promise.all([
      team.issues({ first: READ_LIMIT, orderBy: PaginationOrderBy.UpdatedAt }), team.states(),
    ])
    const tasks = issues.nodes.map((issue) => toTask(issue, states.nodes))
    return {
      ok: true, teamKey: team.key, teamName: team.name,
      done: tasks.filter((task) => task.statusType === 'completed').slice(0, GROUP_SIZE),
      inProgress: tasks.filter((task) => task.statusType === 'started').sort(byPriority).slice(0, GROUP_SIZE),
      upcoming: tasks.filter((task) => !['started', 'completed'].includes(task.statusType)).sort(byPriority).slice(0, GROUP_SIZE),
      statusNames: states.nodes.map((state) => state.name),
      fetchedAt: new Date().toISOString(),
    }
  } catch (error) { return failure(error) }
}

export type WritableIssue = {
  id: string
  identifier: string
  title: string
  url: string
  stateId: string
  stateName: string
  states: { id: string; name: string }[]
}

export class LinearTargetError extends Error {}

export type LinearWriteGateway = {
  issue(id: string): Promise<WritableIssue>
  comment(id: string): Promise<{ issueId: string; body: string } | null>
  createComment(id: string, issueId: string, body: string): Promise<boolean>
  updateStatus(issueId: string, stateId: string): Promise<boolean>
}

// Every write checks the issue's actual team; the small board listing is not an allowlist.
export const linearWriteGateway: LinearWriteGateway = {
  async issue(id) {
    const { client, team } = await openTeam(process.env)
    const issue = await client.issue(id)
    if (!issue || issue.teamId !== team.id) throw new LinearTargetError('That ticket is not on the Sarjy demo board.')
    const states = (await team.states()).nodes.map(({ id, name }) => ({ id, name }))
    const state = states.find((item) => item.id === issue.stateId)
    if (!state) throw new LinearTargetError('The ticket has an unknown workflow state.')
    return { id: issue.id, identifier: issue.identifier, title: issue.title, url: issue.url,
      stateId: state.id, stateName: state.name, states }
  },
  async comment(id) {
    const comment = await new LinearClient({ apiKey: process.env.LINEAR_API_KEY }).comment({ id })
    return comment ? { issueId: comment.issueId ?? '', body: comment.body ?? '' } : null
  },
  async createComment(id, issueId, body) {
    const payload = await new LinearClient({ apiKey: process.env.LINEAR_API_KEY }).createComment({ id, issueId, body })
    return payload.success
  },
  async updateStatus(issueId, stateId) {
    const payload = await new LinearClient({ apiKey: process.env.LINEAR_API_KEY }).updateIssue(issueId, { stateId })
    return payload.success
  },
}
