import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LinearAction } from '../../shared/actions'
import { TASKS_QUERY_KEY } from './tasks'

const key = (standupId: string | undefined) => ['actions', standupId] as const

async function responseBody<T extends { ok: true }>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !body || typeof body !== 'object' || !('ok' in body) || body.ok !== true) {
    throw new Error(body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : 'Could not reach the action service.')
  }
  return body as T
}

export function useActions(standupId: string | undefined) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: key(standupId),
    enabled: !!standupId,
    queryFn: async () => {
      const response = await fetch('/api/actions')
      return (await responseBody<{ ok: true; actions: LinearAction[] }>(response)).actions
    },
    refetchInterval: 1500,
  })
  const mutation = useMutation({
    mutationFn: async ({ actionId, op }: { actionId: string; op: 'confirm' | 'check' }) => {
      const response = await fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId, op }) })
      return (await responseBody<{ ok: true; action: LinearAction }>(response)).action
    },
    onSuccess: (action) => {
      client.setQueryData<LinearAction[]>(key(standupId), (old) => old?.map((item) => item.id === action.id ? action : item))
      void client.invalidateQueries({ queryKey: TASKS_QUERY_KEY })
    },
  })
  return {
    actions: query.data ?? [], isLoading: query.isLoading, loadError: query.error?.message ?? null,
    apply: (actionId: string) => mutation.mutate({ actionId, op: 'confirm' }),
    check: (actionId: string) => mutation.mutate({ actionId, op: 'check' }),
    pendingId: mutation.isPending ? mutation.variables?.actionId : undefined,
    actionError: mutation.error?.message ?? null,
  }
}
