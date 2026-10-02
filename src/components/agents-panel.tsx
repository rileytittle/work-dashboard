"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import clsx from "clsx"
import { ChevronRight, CircleAlert, CircleCheck, GitBranch } from "lucide-react"
import type { Agent } from "@/app/api/agents/route"
import type { ClaudeUsage, UsageLimit } from "@/app/api/claude-usage/route"
import { timeAgo, timeUntil } from "@/lib/time"
import { usePoll } from "@/lib/use-poll"
import { Dots, Panel, PanelLoading, PanelMessage, PanelMeta } from "./panel"

/** How long a session that just finished stays highlighted. */
const FLASH_MS = 6000

const tone = (pct: number) => (pct >= 90 ? "bad" : pct >= 70 ? "warn" : "ok")
const TEXT = { ok: "text-white/80", warn: "text-amber-300", bad: "text-red-400" }
const BAR = { ok: "bg-accent", warn: "bg-amber-300", bad: "bg-red-400" }

function UsageBar({ l }: { l: UsageLimit }) {
  const t = tone(l.percent)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span>{l.label}</span>
        <span className="font-mono">
          <span className={TEXT[t]}>{l.percent}%</span>
          {l.resetsAt && <span className="text-white/25"> · resets in {timeUntil(l.resetsAt)}</span>}
        </span>
      </div>
      <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/10">
        <div
          className={clsx("h-full rounded-full transition-[width] duration-500", BAR[t])}
          style={{ width: `${Math.min(100, l.percent)}%` }}
        />
      </div>
    </div>
  )
}

/** Your Claude plan limits, collapsed; the 5-hour number stays visible. */
function Usage() {
  const { data } = usePoll<ClaudeUsage>("/api/claude-usage", 60_000)
  const session = data?.ok ? data.limits.find((l) => l.kind === "session") : undefined

  return (
    <details className="group/u text-[11px] text-white/45">
      <summary className="label-xs flex cursor-pointer items-center gap-2 transition hover:text-white/70">
        <ChevronRight size={11} className="transition-transform group-open/u:rotate-90" />
        Claude usage
        <span className="ml-auto font-mono normal-case tracking-normal">
          {!data ? (
            <Dots />
          ) : !data.ok ? (
            <span className="text-white/25">unavailable</span>
          ) : session ? (
            <>
              <span className={TEXT[tone(session.percent)]}>{session.percent}%</span> · 5h
            </>
          ) : null}
        </span>
      </summary>
      {data && (
        <div className="mt-2.5 space-y-2">
          {!data.ok ? (
            <div className="text-white/30">{data.reason}</div>
          ) : (
            <>
              {data.limits.map((l) => (
                <UsageBar key={`${l.kind}-${l.label}`} l={l} />
              ))}
              {data.stale && <div className="text-amber-300/60">Last known numbers. {data.stale}</div>}
            </>
          )}
        </div>
      )}
    </details>
  )
}

/** Your running Claude Code sessions: spinner while working, check when done. */
export function AgentsPanel() {
  const { data } = usePoll<{ agents: Agent[] }>("/api/agents", 3000)
  const agents = useMemo(() => data?.agents ?? [], [data])

  // Remember when each session went from working to done, so it can flash
  const prev = useRef(new Map<string, string>())
  const [justDone, setJustDone] = useState<Record<string, number>>({})
  useEffect(() => {
    const finished: Record<string, number> = {}
    for (const a of agents) {
      if (prev.current.get(a.sessionId) === "busy" && a.status !== "busy") finished[a.sessionId] = Date.now()
      prev.current.set(a.sessionId, a.status)
    }
    if (!Object.keys(finished).length) return
    const t = setTimeout(() => setJustDone((d) => ({ ...d, ...finished })), 0)
    return () => clearTimeout(t)
  }, [agents])

  // drives the fade-out of that highlight
  const [now, setNow] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const busy = agents.filter((a) => a.status === "busy").length

  return (
    <Panel
      title="Agents"
      listClassName="max-h-[calc(45vh-7rem)]"
      meta={
        data && (
          <PanelMeta
            main={busy ? `${busy} working` : "All done"}
            sub={`${agents.length} ${agents.length === 1 ? "session" : "sessions"}`}
          />
        )
      }
      footer={<Usage />}
    >
      {!data ? (
        <PanelLoading />
      ) : !agents.length ? (
        <PanelMessage>No Claude Code sessions running.</PanelMessage>
      ) : (
        agents.map((a) => {
          const working = a.status === "busy"
          const done = a.status === "idle"
          const flashing = justDone[a.sessionId] && now - justDone[a.sessionId] < FLASH_MS
          return (
            <div
              key={a.sessionId}
              title={a.lastPrompt ? `“${a.lastPrompt}”` : undefined}
              className={clsx(
                "row row-hover flex gap-2.5",
                flashing && "border-emerald-300/60 bg-emerald-400/10",
              )}
            >
              <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                {working ? (
                  <span className="spinner h-3.5 w-3.5" />
                ) : done ? (
                  <CircleCheck size={15} className="text-emerald-400" />
                ) : (
                  <CircleAlert size={15} className="text-amber-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className={clsx("truncate text-[13px]", working ? "text-white" : "text-white/80")}>
                    {a.title ?? a.name}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-accent">#{a.number}</span>
                </div>
                <div className="flex items-center gap-1 truncate text-[11px] text-white/35">
                  {a.project}
                  {a.branch && (
                    <>
                      <GitBranch size={10} className="shrink-0" />
                      <span className="truncate font-mono">{a.branch}</span>
                    </>
                  )}
                  <span className="shrink-0">
                    · {working ? "working" : done ? "done" : a.status}
                    {a.statusSince ? ` ${timeAgo(new Date(a.statusSince).toISOString())}` : ""}
                  </span>
                </div>
                {a.lastPrompt && (
                  <div className="mt-0.5 line-clamp-2 text-[11px] italic text-white/25">“{a.lastPrompt}”</div>
                )}
              </div>
            </div>
          )
        })
      )}
    </Panel>
  )
}
