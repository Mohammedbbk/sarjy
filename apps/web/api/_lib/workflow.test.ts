import { describe, expect, it } from 'vitest'
import { emptyStandupDoc, type WorkflowSnapshot } from '../../shared/workflow.js'
import { applyCommand, buildSummary } from './workflow.js'

const base = (): WorkflowSnapshot => ({ standupId: 's', stage: 'review', revision: 0, doc: emptyStandupDoc(), startedAt: 'now', finishedAt: null, summary: null })

describe('simplified stand-up rules', () => {
  it('captures multiple concrete updates and marks the section covered', () => {
    const result = applyCommand(base(), { type: 'capture', section: 'review', entries: [{ text: 'Shipped login' }, { text: 'Fixed retry', issueId: 'issue-1', issueIdentifier: 'SAR-7' }] }, () => crypto.randomUUID())
    expect(result.ok && result.plan.doc.progress).toHaveLength(2)
    expect(result.ok && result.plan.doc.coverage.review).toBe('captured')
  })

  it('revises the original entry instead of duplicating a correction', () => {
    const snapshot = base()
    snapshot.doc.progress.push({ id: 'entry-1', text: 'Old wording', issueId: null })
    snapshot.doc.coverage.review = 'captured'
    const result = applyCommand(snapshot, { type: 'revise', entryId: 'entry-1', text: 'Correct wording' }, () => 'unused')
    expect(result.ok && result.plan.doc.progress.map((item) => item.text)).toEqual(['Correct wording'])
  })

  it('blocks confirmation until every section is covered and ambiguity is resolved', () => {
    const snapshot = base()
    expect(applyCommand(snapshot, { type: 'set_stage', stage: 'confirm' }, () => 'id')).toMatchObject({ ok: false, error: 'invalid_transition' })
    snapshot.doc.coverage = { review: 'captured', blockers: 'explicit_none', today: 'captured' }
    snapshot.doc.unresolvedReferences.push({ id: 'ref', phrase: 'KYC', candidateIssueIds: ['a', 'b'], entryId: null })
    expect(applyCommand(snapshot, { type: 'set_stage', stage: 'confirm' }, () => 'id')).toMatchObject({ ok: false, error: 'unresolved_reference' })
  })

  it('builds a recap without dropped corrections', () => {
    const doc = emptyStandupDoc()
    doc.coverage = { review: 'captured', blockers: 'explicit_none', today: 'captured' }
    doc.progress = [{ id: 'old', text: 'Wrong', issueId: null, dropped: true }, { id: 'new', text: 'Right', issueId: null }]
    expect(buildSummary(doc, 'later').progress.map((item) => item.text)).toEqual(['Right'])
  })
})
