import {
  RoomAudioRenderer,
  SessionProvider,
  useSession,
  useSessionContext,
} from '@livekit/components-react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { DemoFooter, Header } from './components/Layout'
import { tokenSource } from './lib/session'
import { TASKS_QUERY_KEY } from './lib/tasks'
import { useStandup } from './lib/useStandup'
import { FinishedView } from './views/FinishedView'
import { IdleView } from './views/IdleView'
import { LiveView } from './views/LiveView'

const SESSION_OPTIONS = { agentConnectTimeoutMilliseconds: 20_000 }

const queryClient = new QueryClient()

export default function App() {
  const session = useSession(tokenSource, SESSION_OPTIONS)

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={session}>
        <Standup />
        {/* Plays the agent's audio. */}
        <RoomAudioRenderer room={session.room} />
      </SessionProvider>
    </QueryClientProvider>
  )
}

function Standup() {
  const standup = useStandup(useSessionContext())
  const queryClient = useQueryClient()
  const { state, start } = standup

  /** Start a stand-up on a fresh ticket list. */
  function startStandup() {
    void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY })
    start()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      {state.status === 'idle' && <IdleView onStart={startStandup} />}
      {(state.status === 'connecting' || state.status === 'active' || state.status === 'failed') && (
        <LiveView standup={standup} />
      )}
      {state.status === 'finished' && (
        <FinishedView
          turns={state.turns}
          duration={state.durationMs}
          onRestart={startStandup}
        />
      )}

      <DemoFooter />
    </div>
  )
}
