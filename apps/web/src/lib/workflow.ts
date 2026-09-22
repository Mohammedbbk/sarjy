import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { StandupSummary, WorkflowSnapshot } from '../../shared/workflow'

type Bootstrap = { ok: true; standup: WorkflowSnapshot; resumed: boolean; lastSummary: StandupSummary | null }
type Failure = { ok: false; error: string; message: string; snapshot?: WorkflowSnapshot }
const KEY = ['workflow'] as const

async function bootstrap(): Promise<Bootstrap> {
  const response = await fetch('/api/bootstrap', { headers: { Accept: 'application/json' } })
  const body = await response.json() as Bootstrap | Failure
  if (!response.ok || !body.ok) throw new Error('message' in body ? body.message : 'Could not load the stand-up.')
  return body
}

export function useWorkflow() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: KEY, queryFn: bootstrap, refetchInterval: (state) => state.state.data?.standup.stage !== 'finished' ? 1500 : false })
  const finish = useMutation({
    mutationFn: async () => {
      const current = query.data?.standup
      if (!current) throw new Error('The stand-up is still loading.')
      const response = await fetch('/api/workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'finish', standupId: current.standupId, expectedRevision: current.revision, requestId: crypto.randomUUID() }) })
      const body = await response.json() as { ok: true; snapshot: WorkflowSnapshot } | Failure
      if (!body.ok) { if (body.snapshot) queryClient.setQueryData<Bootstrap>(KEY, (old) => old ? { ...old, standup: body.snapshot! } : old); throw new Error(body.message) }
      queryClient.setQueryData<Bootstrap>(KEY, (old) => old ? { ...old, standup: body.snapshot } : old)
      return body.snapshot
    },
  })
  return { ...query, snapshot: query.data?.standup, resumed: query.data?.resumed ?? false, lastSummary: query.data?.lastSummary ?? null, finish: finish.mutate, finishing: finish.isPending, finishError: finish.error?.message ?? null }
}
