import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-gold-primary text-white shadow-[0_10px_24px_rgba(0,113,227,0.24)] hover:bg-gold-bright hover:shadow-[0_14px_30px_rgba(0,113,227,0.28)]',
  secondary:
    'border border-border-subtle bg-panel text-text-primary hover:border-border-strong hover:bg-panel-strong',
  ghost: 'text-gold-primary hover:bg-[rgba(0,113,227,0.08)] hover:text-gold-bright',
  danger:
    'border border-[rgba(255,69,58,0.22)] bg-[rgba(255,69,58,0.12)] text-[#ffb1ab] hover:bg-[rgba(255,69,58,0.18)]',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 rounded-full px-4 text-[13px]',
  md: 'h-11 rounded-full px-5 text-sm',
  lg: 'h-12 rounded-full px-6 text-[15px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, size = 'md', style, variant = 'primary', ...props }, ref) {
    return (
      <button
        ref={ref}
        style={style}
        className={cn(
          'interactive-lift inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg disabled:pointer-events-none disabled:opacity-60',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    )
  },
)
