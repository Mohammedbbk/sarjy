import type { Turn } from '../lib/transcript'
import { Eyebrow } from './Layout'

type Props = {
  turns: Turn[]
  placeholder?: string
}

export function Transcript({ turns, placeholder }: Props) {
  if (turns.length === 0 && placeholder) {
    return <p className="text-[15px] leading-relaxed text-dim">{placeholder}</p>
  }

  return (
    <div className="flex flex-col gap-5">
      {turns.map((turn, index) => {
        const isLast = index === turns.length - 1
        return (
          <article key={turn.id} className="flex flex-col gap-1">
            <Eyebrow>{turn.speaker === 'sarjy' ? 'Sarjy' : 'You'}</Eyebrow>
            <p
              className={`text-[15px] leading-relaxed ${isLast ? 'text-text' : 'text-muted'} ${
                turn.interim ? 'italic opacity-70' : ''
              }`}
            >
              {turn.text}
            </p>
          </article>
        )
      })}
    </div>
  )
}
