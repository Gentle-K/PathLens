import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils/cn'

const baseFieldClassName =
  'w-full rounded-[18px] border border-border-subtle bg-panel px-4 py-3.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-border-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(0,113,227,0.12)]'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(baseFieldClassName, className)} {...props} />
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(baseFieldClassName, 'min-h-28 resize-y', className)} {...props} />
})

interface SelectOptionDefinition {
  value: string
  label: string
  disabled?: boolean
}

interface CustomSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, CustomSelectProps>(
  function Select({ children, className, disabled, id, name, onChange, placeholder, value, ...props }, ref) {
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const options = useMemo<SelectOptionDefinition[]>(
      () =>
        Children.toArray(children).flatMap((child) => {
          if (!isValidElement(child)) {
            return []
          }

          const optionProps = child.props as {
            value?: string
            children?: unknown
            disabled?: boolean
          }
          const optionValue = optionProps.value
          const optionLabel =
            typeof optionProps.children === 'string' ? optionProps.children : String(optionProps.children ?? optionValue)

          return [
            {
              value: String(optionValue ?? ''),
              label: optionLabel,
              disabled: Boolean(optionProps.disabled),
            },
          ]
        }),
      [children],
    )

    const selectedOption = options.find((option) => option.value === String(value ?? '')) ?? options[0]

    useEffect(() => {
      if (!open) {
        return
      }

      const handlePointerDown = (event: PointerEvent) => {
        if (!containerRef.current?.contains(event.target as Node)) {
          setOpen(false)
        }
      }

      window.addEventListener('pointerdown', handlePointerDown)
      return () => window.removeEventListener('pointerdown', handlePointerDown)
    }, [open])

    const emitChange = (nextValue: string) => {
      if (disabled) {
        return
      }

      onChange?.({
        target: { name: name ?? '', value: nextValue },
        currentTarget: { name: name ?? '', value: nextValue },
      } as ChangeEvent<HTMLSelectElement>)

      setOpen(false)
    }

    return (
      <div ref={containerRef} className="relative">
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            baseFieldClassName,
            'interactive-lift flex items-center justify-between gap-3 pr-11 text-left disabled:cursor-not-allowed disabled:opacity-60',
            className,
          )}
          onClick={() => setOpen((current) => !current)}
        >
          <span className={cn(selectedOption ? 'text-text-primary' : 'text-text-muted', 'truncate')}>
            {selectedOption?.label ?? placeholder ?? 'Select'}
          </span>
          <ChevronDown
            className={cn(
              'pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-text-muted transition-transform',
              open ? 'rotate-180 text-gold-primary' : '',
            )}
          />
        </button>

        <select
          ref={ref}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          disabled={disabled}
          id={id ? `${id}__native` : undefined}
          name={name}
          onChange={onChange}
          value={value}
          {...props}
        >
          {children}
        </select>

        {open ? (
          <div className="absolute z-50 mt-2 w-full rounded-[20px] border border-border-subtle bg-panel p-2 shadow-[0_18px_42px_rgba(0,0,0,0.16)]">
            <div className="space-y-1" role="listbox" aria-labelledby={id}>
              {options.map((option) => {
                const isActive = option.value === String(value ?? '')

                return (
                  <button
                    key={`${name ?? id ?? 'select'}-${option.value}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    disabled={option.disabled}
                    onClick={() => emitChange(option.value)}
                    className={cn(
                      'interactive-lift flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition',
                      option.disabled
                        ? 'cursor-not-allowed opacity-50'
                        : isActive
                          ? 'bg-[rgba(0,113,227,0.08)] text-text-primary shadow-[0_0_0_1px_rgba(0,113,227,0.14)]'
                          : 'text-text-secondary hover:bg-app-bg-elevated hover:text-text-primary',
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {isActive ? <Check className="ml-3 size-4 shrink-0 text-gold-primary" /> : null}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    )
  },
)
