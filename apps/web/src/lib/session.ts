import { MediaDeviceFailure, TokenSource } from 'livekit-client'

export const tokenSource = TokenSource.endpoint('/api/session')

export type StandupErrorKind =
  | 'microphone-denied'
  | 'microphone-unavailable'
  | 'agent-unavailable'
  | 'connection-failed'

export type StandupError = {
  kind: StandupErrorKind
  message: string
  hint?: string
  detail?: string
}

export function describeStartError(error: unknown): StandupError {
  const deviceFailure = MediaDeviceFailure.getFailure(error)
  if (deviceFailure) return describeMicrophoneFailure(deviceFailure)

  return {
    kind: 'connection-failed',
    message: 'Could not connect to the stand-up room.',
    hint: 'Check your network connection and try again.',
    detail: error instanceof Error ? error.message : String(error),
  }
}

export function describeMicrophoneFailure(failure: MediaDeviceFailure): StandupError {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return {
        kind: 'microphone-denied',
        message: 'Sarjy needs your microphone to run a stand-up.',
        hint: 'Allow microphone access for this site in your browser, then try again.',
      }
    case MediaDeviceFailure.NotFound:
      return {
        kind: 'microphone-unavailable',
        message: 'No microphone was found.',
        hint: 'Plug in or select an input device, then try again.',
      }
    case MediaDeviceFailure.DeviceInUse:
      return {
        kind: 'microphone-unavailable',
        message: 'Your microphone is already in use by another app.',
        hint: 'Close the other app using it, then try again.',
      }
    default:
      return {
        kind: 'microphone-unavailable',
        message: 'Your microphone could not be started.',
        hint: 'Check your input device settings and try again.',
      }
  }
}

export function agentUnavailableError(reasons: readonly string[] | null): StandupError {
  return {
    kind: 'agent-unavailable',
    message: 'Sarjy did not join the stand-up.',
    hint: 'Make sure the agent is running (`pnpm dev` in apps/sarjy-agent), then try again.',
    detail: reasons && reasons.length > 0 ? reasons.join(' · ') : undefined,
  }
}

export function connectionLostError(): StandupError {
  return {
    kind: 'connection-failed',
    message: 'The connection to the stand-up room dropped.',
    hint: 'Check your network connection and start again.',
  }
}
