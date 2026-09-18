/**
 * Real transcript turns, built from the session's message stream.
 *
 * `useSessionMessages` merges LiveKit's user and agent transcriptions with any
 * chat messages. We only need to know who spoke, what was said, and whether the
 * speech-to-text has settled yet.
 */
import type { ReceivedMessage } from '@livekit/components-react'

export type Speaker = 'sarjy' | 'you'

export type Turn = {
  id: string
  speaker: Speaker
  text: string
  /** Interim speech-to-text: still being revised as the speaker talks. */
  interim: boolean
}

/** LiveKit marks a transcription segment final with this participant attribute. */
const TRANSCRIPTION_FINAL = 'lk.transcription_final'

export function toTurns(messages: readonly ReceivedMessage[]): Turn[] {
  return messages
    .map((message): Turn => {
      const isUser = message.type === 'userTranscript'
      const isTranscript = isUser || message.type === 'agentTranscript'

      return {
        id: message.id,
        speaker: isUser ? 'you' : 'sarjy',
        text: message.message.trim(),
        interim: isTranscript && message.attributes?.[TRANSCRIPTION_FINAL] === 'false',
      }
    })
    .filter((turn) => turn.text !== '')
}

/** "2 min 14 sec", matching how the recap has always read. */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) return `${seconds} sec`
  return `${minutes} min ${seconds} sec`
}
