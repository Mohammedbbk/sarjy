
import { z } from 'zod';

const TIMEOUT_MS = 10_000;

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
  done: z.array(TaskSchema),
  inProgress: z.array(TaskSchema),
  upcoming: z.array(TaskSchema),
  openCount: z.number(),
  hasMore: z.boolean(),
});

const TasksErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export type Task = z.infer<typeof TaskSchema>;

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
      teamKey: string;
      done: Task[];
      inProgress: Task[];
      upcoming: Task[];
      openCount: number;
      hasMore: boolean;
    }
  | { ok: false; error: TasksErrorCode; message: string };

const KNOWN_BACKEND_CODES = new Set([
  'server_not_configured',
  'upstream_unavailable',
  'upstream_error',
]);

function fail(error: TasksErrorCode, message: string): TasksResult {
  return { ok: false, error, message };
}


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
    done: parsed.data.done,
    inProgress: parsed.data.inProgress,
    upcoming: parsed.data.upcoming,
    openCount: parsed.data.openCount,
    hasMore: parsed.data.hasMore,
  };
}
