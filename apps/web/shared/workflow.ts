export type Stage = 'review' | 'blockers' | 'today' | 'confirm' | 'finished'
export type Section = 'review' | 'blockers' | 'today'
export type Coverage = 'unasked' | 'captured' | 'explicit_none' | 'skipped'

export const STAGES: readonly Stage[] = ['review', 'blockers', 'today', 'confirm', 'finished']
export const SECTIONS: readonly Section[] = ['review', 'blockers', 'today']
export const SECTION_LIST = {
  review: 'progress', blockers: 'blockers', today: 'commitments',
} as const satisfies Record<Section, keyof Pick<StandupDoc, 'progress' | 'blockers' | 'commitments'>>
export const LIMITS = { entryText: 500, phrase: 120, entriesPerCommand: 5 } as const
export const isCovered = (value: Coverage) => value !== 'unasked'

export type Entry = { id: string; issueId: string | null; issueIdentifier?: string | null; text: string; dropped?: boolean }
export type EntryInput = { id?: string; text: string; issueId?: string | null; issueIdentifier?: string | null }
export type UnresolvedReference = { id: string; phrase: string; candidateIssueIds: string[]; entryId: string | null }
export type StandupDoc = {
  coverage: Record<Section, Coverage>
  progress: Entry[]
  blockers: Entry[]
  commitments: Entry[]
  unresolvedReferences: UnresolvedReference[]
}
export function emptyStandupDoc(): StandupDoc {
  return { coverage: { review: 'unasked', blockers: 'unasked', today: 'unasked' }, progress: [], blockers: [], commitments: [], unresolvedReferences: [] }
}

export type SummaryLine = { text: string; issueId: string | null; issueIdentifier?: string | null }
export type StandupSummary = {
  finishedAt: string
  progress: SummaryLine[]
  blockers: SummaryLine[]
  commitments: SummaryLine[]
  coverage: Record<Section, Coverage>
}
export type WorkflowSnapshot = {
  standupId: string
  stage: Stage
  revision: number
  doc: StandupDoc
  startedAt: string
  finishedAt: string | null
  summary: StandupSummary | null
}
export type WorkflowErrorCode = 'stale_revision' | 'unresolved_reference' | 'invalid_transition' | 'invalid_input' | 'not_found' | 'storage_unavailable' | 'unauthorized' | 'at_capacity'
export type WorkflowFailure = { ok: false; error: WorkflowErrorCode; message: string; snapshot?: WorkflowSnapshot }
export type WorkflowResult = { ok: true; snapshot: WorkflowSnapshot } | WorkflowFailure

export type WorkflowCommand =
  | { type: 'capture'; section: Section; entries: EntryInput[] }
  | { type: 'declare_none'; section: Section }
  | { type: 'skip'; section: Section }
  | { type: 'revise'; entryId: string; text?: string; issueId?: string | null; issueIdentifier?: string | null; drop?: boolean }
  | { type: 'note_reference'; phrase: string; candidateIssueIds: string[]; entryId?: string | null }
  | { type: 'resolve_reference'; referenceId: string; issueId: string; issueIdentifier?: string | null }
  | { type: 'set_stage'; stage: Exclude<Stage, 'finished'> }
