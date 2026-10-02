"use client"

import { useEffect, useState } from "react"
import clsx from "clsx"
import type { Agent } from "@/app/api/agents/route"
import type { LinearCard } from "@/app/api/linear/route"
import { useSettings } from "@/lib/settings"
import { usePoll } from "@/lib/use-poll"

/** Turns the saved setting into a CSS colour: "default" inherits the page's white. */
function clockColor(value: string): string | undefined {
  if (value === "default") return undefined
  return value === "accent" ? "var(--accent)" : value
}

/** The big centre clock, with a one-line count of what's waiting on you. */
export function Clock() {
  const { settings } = useSettings()
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const color = clockColor(settings.clockColor)

  // null until mounted, so the server and the browser agree on the first paint
  if (!now) return <div className="h-[9rem]" />

  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  const [clock, meridiem] = time.split(" ")

  return (
    <div
      className="select-none text-center [text-shadow:0_2px_30px_rgb(0_0_0/0.6)]"
      // one colour for the whole block: the date and the labels follow the clock
      style={color ? { color } : undefined}
    >
      {settings.panels.clock && (
        <>
          <div className="text-[clamp(3.5rem,9vw,7rem)] font-extralight leading-none tracking-[-0.03em] tabular-nums">
            {clock}
            {settings.seconds && (
              <span className="ml-1 align-top text-[0.32em] font-light tracking-normal opacity-40">
                {String(now.getSeconds()).padStart(2, "0")}
              </span>
            )}
            {meridiem && (
              <span className="ml-2 text-[0.26em] font-light tracking-normal opacity-45">{meridiem}</span>
            )}
          </div>
          <div className="mt-3 text-[11px] uppercase tracking-[0.32em] opacity-50">
            {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </>
      )}
      {settings.panels.counts && <Summary standalone={!settings.panels.clock} />}
    </div>
  )
}

/** Counts for whichever panels are switched on; shares their polling. */
function Summary({ standalone }: { standalone: boolean }) {
  const { settings } = useSettings()
  const { issues, reviews, agents } = settings.panels

  const linear = usePoll<{ issues: LinearCard[] }>(issues ? "/api/linear" : "", 60_000)
  const github = usePoll<{ total: number }>(reviews ? "/api/github" : "", 90_000)
  const claude = usePoll<{ agents: Agent[] }>(agents ? "/api/agents" : "", 5000)

  const open = linear.data?.issues.filter((i) => i.state.type !== "completed").length
  const busy = claude.data?.agents.filter((a) => a.status === "busy").length

  const stats: [string, number | undefined][] = [
    ...(issues ? ([["open", open]] as [string, number | undefined][]) : []),
    ...(reviews ? ([["to review", github.data?.total]] as [string, number | undefined][]) : []),
    ...(agents ? ([["agents working", busy]] as [string, number | undefined][]) : []),
  ].filter(([, v]) => v !== undefined)

  if (!stats.length) return null

  return (
    <div
      className={clsx(
        "flex justify-center gap-8 text-[11px] uppercase tracking-[0.14em]",
        standalone ? "mt-0" : "mt-6",
      )}
    >
      {stats.map(([label, value]) => (
        <div key={label}>
          <b className={clsx("block font-light tabular-nums leading-tight", standalone ? "text-4xl" : "text-2xl")}>
            {value}
          </b>
          <span className="opacity-50">{label}</span>
        </div>
      ))}
    </div>
  )
}
