import {
  RoomAudioRenderer,
  SessionProvider,
  useSession,
  useSessionContext,
} from '@livekit/components-react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { DemoFooter } from './components/DemoControls'
import { Header } from './components/Layout'
import { tokenSource } from './lib/session'
import { TASKS_QUERY_KEY } from './lib/tasks'
import { useStandup } from './lib/useStandup'
import { FinishedView } from './views/FinishedView'
import { IdleView } from './views/IdleView'
import { LiveView } from './views/LiveView'

/**
 * Hoisted so re-renders reuse the same options object.
 *
 * `agentConnectTimeoutMilliseconds` is how long to wait for sarjy-agent to pick
 * up before calling it unavailable. It cold-starts its models on the first
 * call, so this is generous.
 */
const SESSION_OPTIONS = { agentConnectTimeoutMilliseconds: 20_000 }

/** Hoisted for the same reason. Defaults that refetch on their own are off. */
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, refetchOnReconnect: false } },
})

export default function App() {
  // One session manages the token, the room and the agent dispatch. Which agent
  // to dispatch is decided server-side: POST /api/session signs it into the
  // token, so the browser never names it and never holds a LiveKit API key.
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
  const { start } = standup

  /** Start a stand-up on a fresh ticket list. */
  const startStandup = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY })
    start()
  }, [queryClient, start])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      {standup.stage === 'idle' && <IdleView onStart={startStandup} />}
      {standup.stage === 'live' && <LiveView standup={standup} />}
      {standup.stage === 'finished' && (
        <FinishedView
          turns={standup.finishedTurns}
          duration={standup.duration}
          onRestart={startStandup}
        />
      )}

      <DemoFooter />
    </div>
  )
}
