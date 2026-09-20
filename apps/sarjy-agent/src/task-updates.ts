export async function updateTask(
  update: { identifier: string; status?: string | undefined; comment?: string | undefined },
  env: Record<string, string | undefined> = process.env,
): Promise<unknown> {
  const failure = { ok: false, error: 'unavailable', message: 'The ticket was not updated.' };
  if (!env.SARJY_API_URL || !env.MEMORY_API_TOKEN?.trim()) return failure;
  try {
    const response = await fetch(new URL('/api/task-updates', env.SARJY_API_URL), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MEMORY_API_TOKEN.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(update),
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    return (await response.json()) ?? failure;
  } catch {
    return failure;
  }
}
