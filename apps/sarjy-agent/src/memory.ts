import { z } from 'zod';

const FactSchema = z.object({ key: z.string(), value: z.string(), updated_at: z.string() });
const ReadSchema = z.object({ ok: z.literal(true), facts: z.array(FactSchema) });
const SaveSchema = z.object({ ok: z.literal(true), fact: FactSchema });
type Failure = { ok: false; error: string; message: string };
export type MemoryResult = z.infer<typeof ReadSchema> | Failure;
type Env = Record<string, string | undefined>;

async function request<T>(
  schema: z.ZodType<T>,
  env: Env,
  input?: { key: string; value: string },
): Promise<T | Failure> {
  const failure: Failure = {
    ok: false,
    error: 'unavailable',
    message: input
      ? 'The fact could not be saved.'
      : 'Memory could not be read; saved facts are unknown.',
  };
  if (!env.SARJY_API_URL || !env.MEMORY_API_TOKEN?.trim()) return failure;
  try {
    const url = new URL('/api/memory', env.SARJY_API_URL);
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
      return failure;
    const response = await fetch(url, {
      method: input ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${env.MEMORY_API_TOKEN.trim()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
      signal: AbortSignal.timeout(7_000),
      redirect: 'error',
    });
    if (!response.ok) return failure;
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : failure;
  } catch {
    return failure;
  }
}

export function fetchMemory(env: Env = process.env): Promise<MemoryResult> {
  return request(ReadSchema, env);
}

export function rememberFact(key: string, value: string, env: Env = process.env) {
  return request(SaveSchema, env, { key, value });
}
