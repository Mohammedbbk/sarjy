/**
 * Stand-up task lookup, via the web app's backend.
 *
 * The agent holds no Linear credentials; it calls GET /api/tasks, which owns
 * them. `SARJY_API_URL` points at that server and is never logged.
 */
import { z } from 'zod';

/** Bound on the whole request. Longer than the backend's own 6s Linear budget. */
const TIMEOUT_MS = 10_000;

/**
 * The GET /api/tasks response, validated rather than trusted: the agent and the
 * web app deploy separately and can be different versions.
 */
const TaskSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  status: z.string(),
  statusType: z.string(),
  priority: z.number(),
  priorityLabel: z.string(),
  url: z.string(),
});

const TasksResponseSchema = z.object({
  source: z.literal('linear'),
  teamKey: z.string(),
  count: z.number(),
  hasMore: z.boolean(),
  tasks: z.array(TaskSchema),
});

/** The endpoint's own failure body. Its `error` is carried through as-is. */
const TasksErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * Why a lookup failed. `not_configured` is ours; `server_not_configured`,
 * `upstream_unavailable` and `upstream_error` come from the backend.
 */
export type TasksErrorCode =
  | 'not_configured'
  | 'server_not_configured'
  | 'upstream_unavailable'
  | 'upstream_error'
  | 'timeout'
  | 'network_error'
  | 'http_error'
  | 'invalid_response';

export type TasksResult =
  | {
      ok: true;
      /** The demo team's key, as the backend reports it. */
      teamKey: string;
      /** Up to the backend's limit. Empty is a valid, successful answer. */
      tasks: Task[];
      /** True when the team has further open tickets beyond these. */
      hasMore: boolean;
    }
  | { ok: false; error: TasksErrorCode; message: string };

/** Backend error codes we recognise and pass through unchanged. */
const KNOWN_BACKEND_CODES = new Set([
  'server_not_configured',
  'upstream_unavailable',
  'upstream_error',
]);

function fail(error: TasksErrorCode, message: string): TasksResult {
  return { ok: false, error, message };
}

/**
 * Fetch the demo team's open tickets from the backend.
 *
 * Sends no parameters: the team is the server's to decide.
 * Never throws — every failure path returns `{ ok: false }` with a code.
 */
export async function fetchStandupTasks(
  env: Record<string, string | undefined> = process.env,
): Promise<TasksResult> {
  const base = env.SARJY_API_URL?.trim();

  if (!base) {
    return fail(
      'not_configured',
      'SARJY_API_URL is missing from the agent environment, so there is no backend to ask.',
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL('/api/tasks', base);
  } catch {
    return fail('not_configured', 'SARJY_API_URL is not a valid URL.');
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return fail('timeout', `The task backend did not respond within ${TIMEOUT_MS}ms.`);
    }
    const detail = error instanceof Error ? error.message : 'unknown error';
    return fail('network_error', `Could not reach the task backend: ${detail}.`);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const failure = TasksErrorSchema.safeParse(body);
    if (failure.success && KNOWN_BACKEND_CODES.has(failure.data.error)) {
      return fail(failure.data.error as TasksErrorCode, failure.data.message);
    }
    return fail('http_error', `The task backend returned HTTP ${response.status}.`);
  }

  const parsed = TasksResponseSchema.safeParse(body);
  if (!parsed.success) {
    return fail('invalid_response', 'The task backend returned an unexpected response shape.');
  }

  return {
    ok: true,
    teamKey: parsed.data.teamKey,
    tasks: parsed.data.tasks,
    hasMore: parsed.data.hasMore,
  };
}
