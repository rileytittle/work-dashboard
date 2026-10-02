import clsx from "clsx"
import type { ReactNode } from "react"

/**
 * The frosted card every list on the dashboard sits in.
 *
 * The height limit is on the scrolling list, not on the card, so a footer that
 * opens up — the Claude usage accordion — makes the card grow downwards instead
 * of squeezing the list above it.
 */
export function Panel({
  title,
  meta,
  footer,
  className,
  listClassName = "max-h-[calc(100vh-13rem)]",
  children,
}: {
  title: string
  /** Small right-aligned status text in the header */
  meta?: ReactNode
  /** Pinned below the scroll area, and free to grow */
  footer?: ReactNode
  /** Extra classes for the card itself */
  className?: string
  /** How tall the scrolling list may get, e.g. when two panels share a column */
  listClassName?: string
  children: ReactNode
}) {
  return (
    <section className={clsx("surface flex flex-col overflow-hidden", className)}>
      <header className="flex items-baseline justify-between gap-3 border-b border-white/10 px-4 pb-2.5 pt-3.5">
        <h2 className="label-xs">{title}</h2>
        <div className="text-right text-[11px] leading-tight text-white/35">{meta}</div>
      </header>
      <div className={clsx("thin-scroll min-h-0 overflow-y-auto p-1.5", listClassName)}>{children}</div>
      {footer && <footer className="shrink-0 border-t border-white/10 px-4 py-2.5">{footer}</footer>}
    </section>
  )
}

export function PanelMessage({ children }: { children: ReactNode }) {
  return <div className="px-4 py-7 text-center text-[13px] leading-relaxed text-white/35">{children}</div>
}

/** Three pulsing dots, used while a panel waits for its first answer. */
export function Dots() {
  return (
    <span className="dots">
      <span />
      <span />
      <span />
    </span>
  )
}

export function PanelLoading() {
  return (
    <PanelMessage>
      <Dots />
    </PanelMessage>
  )
}

/** Count in the panel header, e.g. "6 open". */
export function PanelMeta({ main, sub }: { main?: ReactNode; sub?: ReactNode }) {
  return (
    <>
      {main && <div className="text-white/70">{main}</div>}
      {sub && <div>{sub}</div>}
    </>
  )
}
