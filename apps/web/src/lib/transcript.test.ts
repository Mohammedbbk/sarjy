import { describe, expect, it } from 'vitest'
import type { ReceivedMessage } from '@livekit/components-react'
import { toTurns } from './transcript'

const message = (id: string, text: string, type: 'userTranscript' | 'agentTranscript' = 'userTranscript', final = true) =>
  ({ id, timestamp: 0, message: text, type, attributes: { 'lk.transcription_final': String(final) } }) as ReceivedMessage

describe('speech turns', () => {
  it('joins speech fragments until the agent responds, retaining the first id', () => {
    expect(toTurns([message('1', 'I prefer'), message('2', 'you saying'), message('3', 'Assalamu Alaikum', 'userTranscript', false)]))
      .toEqual([{ id: '1', speaker: 'you', text: 'I prefer you saying Assalamu Alaikum', interim: true }])
  })
  it('keeps replies separate and rebuilds interim text without duplicating it', () => {
    expect(toTurns([message('1', 'Hello'), message('2', 'Welcome', 'agentTranscript'), message('3', 'Thanks')])).toHaveLength(3)
    expect(toTurns([message('1', 'I prefer'), message('2', 'that')])[0]).toMatchObject({ text: 'I prefer that', interim: false })
    expect(toTurns([message('1', '  ')])).toEqual([])
  })
})
