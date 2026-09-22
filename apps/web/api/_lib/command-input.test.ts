import { describe, expect, it } from 'vitest'
import { parseCommand } from './command-input.js'

const UUID = '11111111-1111-4111-8111-111111111111'

function accept(input: unknown) {
  const result = parseCommand(input)
  if (!result.ok) throw new Error(`expected acceptance, got: ${result.message}`)
  return result.command
}

function reject(input: unknown) {
  const result = parseCommand(input)
  if (result.ok) throw new Error('expected the command to be rejected')
  return result.message
}

describe('set_stage', () => {
  it('refuses to reach the finished stage', () => {
    // only the browser can finish a stand-up
    expect(reject({ type: 'set_stage', stage: 'finished' })).toContain('stage must be')
  })

  it('accepts the four stages a conversation moves through', () => {
    for (const stage of ['review', 'blockers', 'today', 'confirm']) {
      expect(accept({ type: 'set_stage', stage })).toEqual({ type: 'set_stage', stage })
    }
  })

  it('refuses anything that is not a stage', () => {
    for (const stage of ['done', '', null, 42, ['confirm'], { stage: 'confirm' }]) {
      expect(reject({ type: 'set_stage', stage })).toBeTruthy()
    }
  })
})

describe('sections', () => {
  it('accepts only the three real sections', () => {
    for (const type of ['declare_none', 'skip'] as const) {
      expect(accept({ type, section: 'blockers' })).toEqual({ type, section: 'blockers' })
      expect(reject({ type, section: 'confirm' })).toContain('section must be')
      expect(reject({ type, section: 'anything' })).toContain('section must be')
      expect(reject({ type })).toContain('section must be')
    }
  })
})

describe('capture', () => {
  it('accepts entries with and without a ticket', () => {
    expect(
      accept({
        type: 'capture',
        section: 'review',
        entries: [{ text: ' Finished referral ' }, { text: 'Also this', issueId: 'issue-1' }],
      }),
    ).toEqual({
      type: 'capture',
      section: 'review',
      entries: [{ text: 'Finished referral' }, { text: 'Also this', issueId: 'issue-1' }],
    })
  })

  it('accepts an entry id for a correction, but only a real one', () => {
    expect(accept({ type: 'capture', section: 'review', entries: [{ id: UUID, text: 'x' }] })).toEqual(
      { type: 'capture', section: 'review', entries: [{ id: UUID, text: 'x' }] },
    )
    expect(reject({ type: 'capture', section: 'review', entries: [{ id: 'nope', text: 'x' }] }))
      .toBeTruthy()
  })

  it('refuses an empty list, too many entries, and unusable text', () => {
    expect(reject({ type: 'capture', section: 'review', entries: [] })).toContain('entries must be')
    expect(
      reject({
        type: 'capture',
        section: 'review',
        entries: Array.from({ length: 6 }, () => ({ text: 'x' })),
      }),
    ).toContain('entries must be')
    for (const text of ['', '   ', 'x'.repeat(501), null, 42, undefined]) {
      expect(reject({ type: 'capture', section: 'review', entries: [{ text }] })).toBeTruthy()
    }
  })

  it('refuses entries that are not objects', () => {
    expect(reject({ type: 'capture', section: 'review', entries: ['just a string'] })).toBeTruthy()
    expect(reject({ type: 'capture', section: 'review', entries: 'not a list' })).toBeTruthy()
  })
})

describe('revise', () => {
  it('keeps null and absent apart for the ticket', () => {
    // null clears the ticket, undefined leaves it alone
    expect(accept({ type: 'revise', entryId: UUID, issueId: null })).toEqual({
      type: 'revise',
      entryId: UUID,
      issueId: null,
    })
    expect(accept({ type: 'revise', entryId: UUID, text: 'new wording' })).toEqual({
      type: 'revise',
      entryId: UUID,
      text: 'new wording',
    })
  })

  it('accepts a drop, and only as a boolean', () => {
    expect(accept({ type: 'revise', entryId: UUID, drop: true })).toMatchObject({ drop: true })
    expect(reject({ type: 'revise', entryId: UUID, drop: 'yes' })).toContain('drop must be')
  })

  it('needs a real entry id', () => {
    expect(reject({ type: 'revise', entryId: 'not-a-uuid', text: 'x' })).toContain('entryId')
    expect(reject({ type: 'revise', text: 'x' })).toContain('entryId')
  })

  it('refuses text that is empty or too long', () => {
    expect(reject({ type: 'revise', entryId: UUID, text: '  ' })).toContain('text must be')
    expect(reject({ type: 'revise', entryId: UUID, text: 'x'.repeat(501) })).toContain('text must be')
  })
})

describe('references', () => {
  it('needs at least two candidates to be ambiguous', () => {
    expect(
      reject({ type: 'note_reference', phrase: 'KYC', candidateIssueIds: ['issue-1'] }),
    ).toContain('2–8')
    expect(
      accept({ type: 'note_reference', phrase: 'KYC', candidateIssueIds: ['a', 'b'] }),
    ).toMatchObject({ candidateIssueIds: ['a', 'b'], entryId: null })
  })

  it('caps the candidate list', () => {
    expect(
      reject({
        type: 'note_reference',
        phrase: 'KYC',
        candidateIssueIds: Array.from({ length: 9 }, (_, i) => `issue-${i}`),
      }),
    ).toContain('2–8')
  })

  it('refuses a phrase that is empty or too long', () => {
    const candidateIssueIds = ['a', 'b']
    expect(reject({ type: 'note_reference', phrase: '  ', candidateIssueIds })).toContain('phrase')
    expect(
      reject({ type: 'note_reference', phrase: 'x'.repeat(121), candidateIssueIds }),
    ).toContain('phrase')
  })

  it('resolves only with a real reference id and a ticket', () => {
    expect(accept({ type: 'resolve_reference', referenceId: UUID, issueId: 'issue-1' })).toEqual({
      type: 'resolve_reference',
      referenceId: UUID,
      issueId: 'issue-1',
    })
    expect(reject({ type: 'resolve_reference', referenceId: 'x', issueId: 'issue-1' })).toBeTruthy()
    expect(reject({ type: 'resolve_reference', referenceId: UUID })).toContain('issueId')
    expect(reject({ type: 'resolve_reference', referenceId: UUID, issueId: null })).toContain('issueId')
  })
})

describe('anything else', () => {
  it('refuses unknown types and non-objects', () => {
    expect(reject({ type: 'apply_proposal', proposalId: UUID })).toContain('Unknown command type')
    expect(reject({ type: 'finish' })).toContain('Unknown command type')
    expect(reject({})).toContain('Unknown command type')
    for (const input of [null, undefined, 'capture', 42, ['capture']]) {
      expect(reject(input)).toBeTruthy()
    }
  })

  it('drops fields it does not recognise rather than passing them through', () => {
    const command = accept({
      type: 'skip',
      section: 'blockers',
      visitorId: 'someone-else',
      standupId: 'another-standup',
    })
    expect(command).toEqual({ type: 'skip', section: 'blockers' })
  })
})
