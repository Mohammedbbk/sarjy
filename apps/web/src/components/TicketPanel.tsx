import type { Task, TasksResponse, TaskStatusType } from '../../shared/tasks'
import { useTasks, TasksRequestError } from '../lib/tasks'
import { Button } from './Button'

// only in-progress gets a colour
const dotFor: Record<TaskStatusType, string> = {
  started: 'bg-accent',
  triage: 'border-[1.5px] border-muted',
  unstarted: 'border-[1.5px] border-muted',
  backlog: 'border-[1.5px] border-dimmer',
  completed: 'bg-dim',
}

export function TicketPanel() {
  const { data, error, isPending, isFetching, refetch } = useTasks()

  const openCount = data ? data.inProgress.length + data.upcoming.length : 0

  return (
    <section className="flex flex-col gap-4.5" aria-labelledby="ticket-panel-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="ticket-panel-heading" className="text-[15px] font-semibold">
          Shared demo board
        </h2>
        <span className="font-mono text-xs text-dim">{data ? `${openCount} open` : '—'}</span>
      </div>

      <div aria-live="polite" aria-busy={isPending}>
        {isPending ? (
          <TicketSkeleton />
        ) : error ? (
          <TicketError error={error} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : openCount === 0 && data.done.length === 0 ? (
          <TicketsEmpty />
        ) : (
          <TicketGroups data={data} />
        )}
      </div>
    </section>
  )
}

function TicketGroups({ data }: { data: TasksResponse }) {
  const groups = [
    { heading: 'Recently done', tasks: data.done, empty: 'Nothing finished yet.', quiet: true },
    { heading: 'In progress', tasks: data.inProgress, empty: 'Nothing started yet.', quiet: false },
    { heading: 'Up next', tasks: data.upcoming, empty: 'Nothing waiting.', quiet: false },
  ]

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div
          key={group.heading}
          className={`flex flex-col gap-2.5 ${group.quiet ? 'opacity-60' : ''}`}
        >
          <h3 className="px-1.5 font-mono text-[11px] font-medium tracking-[0.05em] text-dim uppercase">
            {`${group.heading} · ${group.tasks.length}`}
          </h3>
          {group.tasks.length === 0 ? (
            <p className="px-1.5 text-[13px] text-dim">{group.empty}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {group.tasks.map((task) => (
                <TicketRow key={task.id} task={task} />
              ))}
            </ul>
          )}
        </div>
      ))}

    </div>
  )
}

function TicketRow({ task }: { task: Task }) {
  const done = task.statusType === 'completed'
  return (
    <li className="flex items-center gap-2.5 rounded-md px-1.5 py-2">
      <span
        className={`size-1.5 shrink-0 rounded-full ${dotFor[task.statusType]}`}
        aria-hidden="true"
      />
      <span className="min-w-[44px] shrink-0 font-mono text-xs text-dim">{task.identifier}</span>
      <span className={`flex-1 truncate text-[13.5px] ${done ? 'text-muted line-through' : ''}`}>
        {task.title}
      </span>
      <span className="min-w-[60px] shrink-0 text-right font-mono text-[11px] text-dim">
        {task.status}
      </span>
    </li>
  )
}

function TicketSkeleton() {
  return (
    <ul className="flex animate-pulse flex-col gap-1" aria-label="Loading tickets">
      {[0, 1, 2, 3].map((row) => (
        <li key={row} className="flex items-center gap-2.5 px-2.5 py-2.5">
          <span className="size-2 shrink-0 rounded-full bg-line-strong" />
          <span className="h-3 w-[58px] shrink-0 rounded bg-line-strong" />
          <span className="h-3 flex-1 rounded bg-line" />
        </li>
      ))}
    </ul>
  )
}

function TicketsEmpty() {
  return (
    <p className="px-2.5 text-[13.5px] leading-relaxed text-dim">
      The demo board has no visible tickets yet.
    </p>
  )
}

function TicketError({
  error,
  onRetry,
  isRetrying,
}: {
  error: unknown
  onRetry: () => void
  isRetrying: boolean
}) {
  const message =
    error instanceof TasksRequestError ? error.message : 'Could not load tickets from Linear.'

  return (
    <div className="flex flex-col items-start gap-2.5 rounded-xl border border-line-strong bg-raised px-3.5 py-3">
      <p className="text-[13px] leading-relaxed text-muted">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry} disabled={isRetrying}>
        {isRetrying ? 'Retrying…' : 'Try again'}
      </Button>
    </div>
  )
}
