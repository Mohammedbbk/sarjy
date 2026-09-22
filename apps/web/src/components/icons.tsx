import type { ReactNode } from 'react'

type IconProps = { size?: number }

function Svg({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const micBody = (
  <>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </>
)

export function MicIcon(props: IconProps) {
  return <Svg {...props}>{micBody}</Svg>
}

export function MicOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {micBody}
      <line x1="2" y1="2" x2="22" y2="22" />
    </Svg>
  )
}

export function WaveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="4" y1="9" x2="4" y2="15" />
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="14" y1="7" x2="14" y2="17" />
      <line x1="19" y1="10" x2="19" y2="14" />
    </Svg>
  )
}

export function DotsIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  )
}
