import type { useStandup } from '../lib/useStandup'
import type { useWorkflow } from '../lib/workflow'
import { useActions } from '../lib/actions'
import { FinishedView } from './FinishedView'
import { IdleView } from './IdleView'
import { LiveView } from './LiveView'

type Props = {
  standup: ReturnType<typeof useStandup>
  workflow: ReturnType<typeof useWorkflow>
  onStart: () => void
}

export function StandupScreen({ standup, workflow, onStart }: Props) {
  const actions = useActions(workflow.snapshot?.standupId)
  if (workflow.isLoading) {
    return <main className="mx-auto w-full max-w-4xl p-8 text-muted">Loading your stand-up…</main>
  }

  if (workflow.isError) {
    return <main className="mx-auto w-full max-w-4xl p-8 text-red">{workflow.error.message}</main>
  }

  const { state } = standup

  switch (state.status) {
    case 'idle':
      return (
        <IdleView
          onStart={onStart}
          snapshot={workflow.snapshot}
          resumed={workflow.resumed}
          lastSummary={workflow.lastSummary}
          actions={actions}
        />
      )

    case 'connecting':
    case 'active':
    case 'failed':
      return <LiveView standup={standup} snapshot={workflow.snapshot} actions={actions} />

    case 'finished':
      return (
        <FinishedView
          turns={state.turns}
          duration={state.durationMs}
          onRestart={onStart}
          snapshot={workflow.snapshot}
          onFinish={workflow.finish}
          finishing={workflow.finishing}
          finishError={workflow.finishError}
          actions={actions}
        />
      )
  }
}
