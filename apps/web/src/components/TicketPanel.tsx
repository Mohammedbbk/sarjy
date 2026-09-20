import type { Task, TasksResponse, TaskStatusType } from '../../shared/tasks'
import { useTasks, TasksRequestError } from '../lib/tasks'
import { Button } from './Button'

const dotFor: Record<TaskStatusType, string> = {
  started: 'bg-amber',
  triage: 'bg-accent',
  unstarted: 'border-[1.5px] border-muted',
  backlog: 'border-[1.5px] border-dimmer',
  completed: 'bg-dimmer',
}

export function TicketPanel() {
  const { data, error, isPending, isFetching, refetch } = useTasks()

  return (
    <section className="flex flex-col gap-4.5" aria-labelledby="ticket-panel-heading">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 id="ticket-panel-heading" className="text-[15px] font-bold">
            Linear tickets
          </h2>
          <span className="font-mono text-xs text-dim">
            {data ? `${data.openCount}${data.hasMore ? '+' : ''} open` : '—'}
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-xs leading-relaxed text-dim">
          <span className="inline-flex shrink-0 items-center rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.05em] text-muted uppercase">
            Demo workspace
          </span>
          Live from Linear. Sarjy only changes a ticket after you confirm.
        </p>
      </div>

      <div aria-live="polite" aria-busy={isPending}>
        {isPending ? (
          <TicketSkeleton />
        ) : error ? (
          <TicketError error={error} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : data.openCount === 0 && data.done.length === 0 ? (
          <TicketsEmpty />
        ) : (
          <TicketGroups data={data} />
        )}
      </div>
    </section>
  )
}

/** The three groups, in the order a stand-up walks through them. */
function TicketGroups({ data }: { data: TasksResponse }) {
  const groups = [
    { heading: 'Recently done', tasks: data.done, empty: 'Nothing finished yet.' },
    { heading: 'In progress', tasks: data.inProgress, empty: 'Nothing started yet.' },
    { heading: 'Up next', tasks: data.upcoming, empty: 'Nothing waiting.' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.heading} className="flex flex-col gap-1.5">
          <h3 className="px-2.5 font-mono text-[10px] font-semibold tracking-[0.05em] text-dim uppercase">
            {group.heading}
          </h3>
          {group.tasks.length === 0 ? (
            <p className="px-2.5 text-[13px] text-dim">{group.empty}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {group.tasks.map((task) => (
                <TicketRow key={task.id} task={task} />
              ))}
            </ul>
          )}
        </div>
      ))}

      {data.hasMore && (
        <p className="px-2.5 text-xs leading-relaxed text-dim">
          The team has more open tickets than these.
        </p>
      )}
    </div>
  )
}

function TicketRow({ task }: { task: Task }) {
  const done = task.statusType === 'completed'
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2.5">
      <span
        className={`size-2 shrink-0 rounded-full ${dotFor[task.statusType]}`}
        aria-hidden="true"
      />
      <span className="min-w-[58px] shrink-0 font-mono text-xs text-dim">{task.identifier}</span>
      <span className={`flex-1 truncate text-[13.5px] ${done ? 'text-dim line-through' : ''}`}>
        {task.title}
      </span>
      <span className="min-w-[78px] shrink-0 text-right font-mono text-[11px] text-dim">
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
      No tickets on this team yet. Nothing to review today.
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
