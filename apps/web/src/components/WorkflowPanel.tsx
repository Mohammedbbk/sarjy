import type { Entry, Stage, WorkflowSnapshot } from '../../shared/workflow'

type Step = { key: Exclude<Stage, 'finished'>; label: string }

const steps: Step[] = [
  { key: 'review', label: 'Progress' },
  { key: 'blockers', label: 'Blockers' },
  { key: 'today', label: 'Today' },
  { key: 'confirm', label: 'Confirm' },
]

export function WorkflowPanel({ snapshot }: { snapshot: WorkflowSnapshot }) {
  const { progress, blockers, commitments, unresolvedReferences } = snapshot.doc
  const entries = [...progress, ...blockers, ...commitments].filter((entry) => !entry.dropped)
  const unclear = unresolvedReferences.map((reference) => reference.phrase)

  return (
    <section className="rounded-xl border border-line bg-raised p-5" aria-label="Stand-up progress">
      <p className="mb-4 font-mono text-[11px] tracking-[0.12em] text-dim uppercase">
        Saved as you speak
      </p>

      <StepTracker stage={snapshot.stage} />

      {entries.length > 0 && <EntryList entries={entries} />}

      {unclear.length > 0 && (
        <p className="mt-4 text-xs text-amber">Waiting to clarify: {unclear.join(', ')}</p>
      )}
    </section>
  )
}

function StepTracker({ stage }: { stage: Stage }) {
  const current = stage === 'finished' ? steps.length : steps.findIndex((step) => step.key === stage)

  return (
    <ol className="grid grid-cols-4 gap-2">
      {steps.map((step, index) => {
        const reached = index <= current
        return (
          <li
            key={step.key}
            className={`border-t-2 pt-2 text-xs ${reached ? 'border-accent text-text' : 'border-line text-dim'}`}
          >
            {step.label}
          </li>
        )
      })}
    </ol>
  )
}

function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <ul className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
      {entries.map((entry) => (
        <li key={entry.id} className="text-sm leading-relaxed text-soft">
          <span className="mr-2 font-mono text-[11px] text-accent">
            {entry.issueIdentifier ?? 'NOTE'}
          </span>
          {entry.text}
        </li>
      ))}
    </ul>
  )
}
