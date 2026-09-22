import {
  RoomAudioRenderer,
  SessionProvider,
  useSession,
  useSessionContext,
} from '@livekit/components-react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { Header } from './components/Layout'
import { tokenSource } from './lib/session'
import { TASKS_QUERY_KEY } from './lib/tasks'
import { useStandup } from './lib/useStandup'
import { useWorkflow } from './lib/workflow'
import { StandupScreen } from './views/StandupScreen'

const SESSION_OPTIONS = { agentConnectTimeoutMilliseconds: 20_000 }

const queryClient = new QueryClient()

export default function App() {
  const session = useSession(tokenSource, SESSION_OPTIONS)

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={session}>
        <Standup />
        <RoomAudioRenderer room={session.room} />
      </SessionProvider>
    </QueryClientProvider>
  )
}

function Standup() {
  const standup = useStandup(useSessionContext())
  const workflow = useWorkflow()
  const queryClient = useQueryClient()
  function startStandup() {
    void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY })
    void workflow.refetch()
    standup.start()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <StandupScreen standup={standup} workflow={workflow} onStart={startStandup} />
    </div>
  )
}
