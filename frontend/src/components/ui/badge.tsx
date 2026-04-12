import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils/cn'

const toneClasses = {
  neutral: 'border border-border-subtle bg-panel text-text-secondary',
  gold: 'border border-[rgba(0,113,227,0.12)] bg-[rgba(0,113,227,0.08)] text-gold-primary',
  success: 'border border-[rgba(48,209,88,0.12)] bg-[rgba(48,209,88,0.1)] text-[color:var(--success)]',
  warning: 'border border-[rgba(255,159,10,0.12)] bg-[rgba(255,159,10,0.1)] text-[color:var(--warning)]',
  danger: 'border border-[rgba(255,69,58,0.12)] bg-[rgba(255,69,58,0.1)] text-[color:var(--danger)]',
} as const

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: keyof typeof toneClasses
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium tracking-[-0.01em]',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  )
}
