import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet'

const base =
  'inline-flex w-fit items-center gap-2 rounded-md font-semibold transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text ' +
  'disabled:cursor-not-allowed disabled:opacity-45'

const variants: Record<Variant, string> = {
  primary: 'bg-text text-bg hover:bg-text/90',
  secondary: 'border border-line-strong text-text hover:bg-raised',
  danger: 'border border-red/35 text-red hover:bg-red/10',
  quiet: 'border border-line-strong text-muted hover:bg-raised',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const sizes = {
  sm: 'px-4 py-2 text-[13px]',
  md: 'px-5.5 py-3.5 text-sm',
  lg: 'px-6.5 py-3.5 text-[15px]',
}

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }: Props) {
  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
}
