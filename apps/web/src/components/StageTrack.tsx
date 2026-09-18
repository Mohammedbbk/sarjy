import { STAGES, type Stage } from '../lib/parked'

/**
 * Parked: not mounted anywhere.
 *
 * The stand-up stages were part of the simulated demo. The agent reports no
 * position in a workflow, so nothing can drive this honestly yet. Kept for
 * when there is real workflow state to show.
 */

/** The four stand-up stages, with the current one highlighted. */
export function StageTrack({ current }: { current: Stage }) {
  const currentIndex = STAGES.findIndex((stage) => stage.key === current)

  return (
    <ol className="flex flex-wrap items-center gap-2 font-mono text-xs tracking-[0.08em] uppercase">
      {STAGES.map((stage, index) => {
        const isCurrent = index === currentIndex
        const isDone = index < currentIndex
        return (
          <li key={stage.key} className="flex items-center gap-2">
            <span
              className={
                isCurrent
                  ? 'font-bold text-accent'
                  : isDone
                    ? 'font-semibold text-dim/75'
                    : 'font-medium text-dim/45'
              }
              aria-current={isCurrent ? 'step' : undefined}
            >
              {stage.label}
            </span>
            {index < STAGES.length - 1 && (
              <span className="text-dim/50" aria-hidden="true">
                ·
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
