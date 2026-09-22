import { LIMITS, SECTIONS, STAGES, type EntryInput, type Section, type Stage, type WorkflowCommand } from '../../shared/workflow.js'

export type ParseResult = { ok: true; command: WorkflowCommand } | { ok: false; message: string }
const bad = (message: string): ParseResult => ({ ok: false, message })
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : null
const section = (value: unknown) => typeof value === 'string' && SECTIONS.includes(value as Section) ? value as Section : null
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null
const optionalString = (value: unknown, max = 100) => value === undefined || value === null || (typeof value === 'string' && value.length <= max)

function parseEntries(value: unknown): EntryInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > LIMITS.entriesPerCommand) return null
  const result: EntryInput[] = []
  for (const raw of value) {
    if (!record(raw)) return null
    const body = text(raw.text, LIMITS.entryText)
    if (!body || !optionalString(raw.issueId) || !optionalString(raw.issueIdentifier, 32)) return null
    const entry: EntryInput = { text: body }
    if (raw.id !== undefined) { const id = uuid(raw.id); if (!id) return null; entry.id = id }
    if (raw.issueId !== undefined) entry.issueId = raw.issueId as string | null
    if (raw.issueIdentifier !== undefined) entry.issueIdentifier = raw.issueIdentifier as string | null
    result.push(entry)
  }
  return result
}

export function parseCommand(input: unknown): ParseResult {
  if (!record(input)) return bad('A command must be an object.')
  switch (input.type) {
    case 'capture': {
      const target = section(input.section)
      const entries = parseEntries(input.entries)
      return target && entries ? { ok: true, command: { type: 'capture', section: target, entries } } : bad('section must be valid and entries must be 1–5 updates.')
    }
    case 'declare_none':
    case 'skip': {
      const target = section(input.section)
      return target ? { ok: true, command: { type: input.type, section: target } } : bad('section must be review, blockers or today.')
    }
    case 'revise': {
      const entryId = uuid(input.entryId)
      if (!entryId) return bad('entryId must be a UUID.')
      if (input.drop !== undefined && typeof input.drop !== 'boolean') return bad('drop must be a boolean.')
      if (!optionalString(input.issueId) || !optionalString(input.issueIdentifier, 32)) return bad('Ticket reference is invalid.')
      const command: Extract<WorkflowCommand, { type: 'revise' }> = { type: 'revise', entryId }
      if (input.text !== undefined) { const body = text(input.text, LIMITS.entryText); if (!body) return bad('text must be 1–500 characters.'); command.text = body }
      if (input.issueId !== undefined) command.issueId = input.issueId as string | null
      if (input.issueIdentifier !== undefined) command.issueIdentifier = input.issueIdentifier as string | null
      if (input.drop !== undefined) command.drop = input.drop
      return { ok: true, command }
    }
    case 'note_reference': {
      const phrase = text(input.phrase, LIMITS.phrase)
      if (!phrase || !Array.isArray(input.candidateIssueIds) || input.candidateIssueIds.length < 2 || input.candidateIssueIds.length > 8 || input.candidateIssueIds.some((id) => typeof id !== 'string' || !id)) return bad('Send a phrase and 2–8 candidate ticket ids.')
      let entryId: string | null = null
      if (input.entryId != null) { entryId = uuid(input.entryId); if (!entryId) return bad('entryId is invalid.') }
      return { ok: true, command: { type: 'note_reference', phrase, candidateIssueIds: input.candidateIssueIds as string[], entryId } }
    }
    case 'resolve_reference': {
      const referenceId = uuid(input.referenceId)
      if (!referenceId) return bad('referenceId must be a UUID.')
      if (typeof input.issueId !== 'string' || !input.issueId || !optionalString(input.issueIdentifier, 32)) return bad('issueId must identify one offered ticket.')
      return { ok: true, command: { type: 'resolve_reference', referenceId, issueId: input.issueId, issueIdentifier: input.issueIdentifier as string | null | undefined } }
    }
    case 'set_stage': {
      if (typeof input.stage !== 'string' || input.stage === 'finished' || !STAGES.includes(input.stage as Stage)) return bad('stage must be review, blockers, today or confirm.')
      return { ok: true, command: { type: 'set_stage', stage: input.stage as Exclude<Stage, 'finished'> } }
    }
    default:
      return bad('Unknown command type.')
  }
}
