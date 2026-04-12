import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        {eyebrow ? (
          <p className="apple-kicker">{eyebrow}</p>
        ) : null}
        <h1 className="max-w-[14ch] text-4xl font-semibold leading-[0.98] tracking-[-0.06em] text-text-primary md:text-5xl">
          {title}
        </h1>
        <p className="max-w-[44rem] text-[17px] leading-[1.47] text-text-secondary">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  )
}
