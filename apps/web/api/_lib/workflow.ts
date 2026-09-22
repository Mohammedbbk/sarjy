import { LIMITS, SECTION_LIST, SECTIONS, isCovered, type Entry, type Section, type Stage, type StandupDoc, type StandupSummary, type WorkflowCommand, type WorkflowErrorCode, type WorkflowSnapshot } from '../../shared/workflow.js'

export type CommandPlan = { stage: Stage; doc: StandupDoc }
export type CommandOutcome = { ok: true; plan: CommandPlan } | { ok: false; error: WorkflowErrorCode; message: string }
const fail = (error: WorkflowErrorCode, message: string): CommandOutcome => ({ ok: false, error, message })
const clone = (doc: StandupDoc): StandupDoc => structuredClone(doc)

function findEntry(doc: StandupDoc, id: string): Entry | null {
  for (const section of SECTIONS) {
    const found = doc[SECTION_LIST[section]].find((entry) => entry.id === id)
    if (found) return found
  }
  return null
}
function cleanText(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  const valueTrimmed = value.trim()
  return valueTrimmed && valueTrimmed.length <= limit ? valueTrimmed : null
}

export function applyCommand(snapshot: WorkflowSnapshot, command: WorkflowCommand, newId: () => string): CommandOutcome {
  if (snapshot.finishedAt) return fail('invalid_transition', 'This stand-up is already finished.')
  const doc = clone(snapshot.doc)
  switch (command.type) {
    case 'capture': {
      if (!SECTIONS.includes(command.section) || !Array.isArray(command.entries) || command.entries.length < 1 || command.entries.length > LIMITS.entriesPerCommand) return fail('invalid_input', 'Capture one to five updates for a valid section.')
      const target = doc[SECTION_LIST[command.section]]
      for (const input of command.entries) {
        const value = cleanText(input.text, LIMITS.entryText)
        if (!value) return fail('invalid_input', `Update text must be 1–${LIMITS.entryText} characters.`)
        if (input.id) {
          const existing = target.find((entry) => entry.id === input.id)
          if (!existing) return fail('not_found', 'There is no captured update with that id.')
          existing.text = value
          if (input.issueId !== undefined) existing.issueId = input.issueId
          if (input.issueIdentifier !== undefined) existing.issueIdentifier = input.issueIdentifier
          existing.dropped = false
        } else {
          target.push({ id: newId(), text: value, issueId: input.issueId ?? null, issueIdentifier: input.issueIdentifier ?? null })
        }
      }
      doc.coverage[command.section] = 'captured'
      return { ok: true, plan: { stage: snapshot.stage, doc } }
    }
    case 'declare_none':
      if (!SECTIONS.includes(command.section)) return fail('invalid_input', 'That is not a stand-up section.')
      for (const entry of doc[SECTION_LIST[command.section]]) entry.dropped = true
      doc.coverage[command.section] = 'explicit_none'
      return { ok: true, plan: { stage: snapshot.stage, doc } }
    case 'skip':
      if (!SECTIONS.includes(command.section)) return fail('invalid_input', 'That is not a stand-up section.')
      doc.coverage[command.section] = 'skipped'
      return { ok: true, plan: { stage: snapshot.stage, doc } }
    case 'revise': {
      const entry = findEntry(doc, command.entryId)
      if (!entry) return fail('not_found', 'There is no captured update with that id.')
      if (command.text === undefined && command.issueId === undefined && command.issueIdentifier === undefined && command.drop !== true) return fail('invalid_input', 'A correction must change or remove the update.')
      if (command.text !== undefined) {
        const value = cleanText(command.text, LIMITS.entryText)
        if (!value) return fail('invalid_input', `Update text must be 1–${LIMITS.entryText} characters.`)
        entry.text = value
      }
      if (command.issueId !== undefined) entry.issueId = command.issueId
      if (command.issueIdentifier !== undefined) entry.issueIdentifier = command.issueIdentifier
      if (command.drop) entry.dropped = true
      return { ok: true, plan: { stage: snapshot.stage, doc } }
    }
    case 'note_reference': {
      const phrase = cleanText(command.phrase, LIMITS.phrase)
      if (!phrase || command.candidateIssueIds.length < 2) return fail('invalid_input', 'An ambiguity needs a phrase and at least two ticket choices.')
      if (command.entryId && !findEntry(doc, command.entryId)) return fail('not_found', 'There is no captured update with that id.')
      doc.unresolvedReferences.push({ id: newId(), phrase, candidateIssueIds: [...new Set(command.candidateIssueIds)], entryId: command.entryId ?? null })
      return { ok: true, plan: { stage: snapshot.stage, doc } }
    }
    case 'resolve_reference': {
      const index = doc.unresolvedReferences.findIndex((reference) => reference.id === command.referenceId)
      if (index < 0) return fail('not_found', 'There is no pending ticket clarification with that id.')
      const reference = doc.unresolvedReferences[index]!
      if (!reference.candidateIssueIds.includes(command.issueId)) return fail('invalid_input', 'Choose one of the offered tickets.')
      if (reference.entryId) {
        const entry = findEntry(doc, reference.entryId)
        if (entry) { entry.issueId = command.issueId; entry.issueIdentifier = command.issueIdentifier ?? null }
      }
      doc.unresolvedReferences.splice(index, 1)
      return { ok: true, plan: { stage: snapshot.stage, doc } }
    }
    case 'set_stage': {
      const target = command.stage as Stage
      if (target === 'finished' || (!SECTIONS.includes(target as Section) && target !== 'confirm')) return fail('invalid_transition', 'That stage cannot be selected.')
      if (target === 'confirm') {
        const missing = SECTIONS.filter((section) => !isCovered(doc.coverage[section]))
        if (missing.length) return fail('invalid_transition', `Still to cover: ${missing.join(', ')}.`)
        if (doc.unresolvedReferences.length) return fail('unresolved_reference', 'Resolve the pending ticket clarification first.')
      }
      return { ok: true, plan: { stage: target, doc } }
    }
  }
}

export function nextStage(doc: StandupDoc): Exclude<Stage, 'finished'> {
  return SECTIONS.find((section) => !isCovered(doc.coverage[section])) ?? 'confirm'
}
export function buildSummary(doc: StandupDoc, finishedAt: string): StandupSummary {
  const active = (entries: Entry[]) => entries.filter((entry) => !entry.dropped).map(({ text, issueId, issueIdentifier }) => ({ text, issueId, issueIdentifier }))
  return { finishedAt, progress: active(doc.progress), blockers: active(doc.blockers), commitments: active(doc.commitments), coverage: { ...doc.coverage } }
}
