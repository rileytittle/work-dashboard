"use client"

import { useEffect, useState } from "react"
import { AlertCircle, ChevronDown, ChevronUp, Play, RefreshCw, Sparkles } from "lucide-react"
import type { PrRef, Report, ReportStatus } from "@/lib/report/types"
import clsx from "clsx"
import { linearHref, useSettings } from "@/lib/settings"
import { timeUntil } from "@/lib/time"
import { refreshPoll, usePoll } from "@/lib/use-poll"
import { Dots } from "./panel"

const URL = "/api/report"

/**
 * A pill under the header until the report has run, then a card you can collapse
 * back into it. The card floats over the dashboard instead of pushing it down,
 * so nothing below moves. "Run now" forces a run at any time of day.
 */
export function ReportPill() {
  const { settings, set } = useSettings()
  const { data } = usePoll<ReportStatus>(URL, 15_000)
  const [starting, setStarting] = useState(false)

  // the server is working: either there is no report yet, or there is one and
  // a fresh run is replacing it
  const serverRunning = data?.status === "running" || (data?.status === "ready" && data.running)

  const run = async () => {
    setStarting(true)
    await fetch(URL, { method: "POST" }).catch(() => {})
    await refreshPoll(URL)
  }

  // hand the busy state over to the server as soon as it admits to running, and
  // let go if it somehow never does
  useEffect(() => {
    if (!starting) return
    if (serverRunning) return setStarting(false)
    const giveUp = setTimeout(() => setStarting(false), 20_000)
    return () => clearTimeout(giveUp)
  }, [starting, serverRunning])

  // 15s is fine for waiting; while it writes, check often enough to feel live
  useEffect(() => {
    if (!serverRunning) return
    const id = setInterval(() => refreshPoll(URL), 2500)
    return () => clearInterval(id)
  }, [serverRunning])

  const busy = starting || serverRunning
  const expanded = data?.status === "ready" && settings.reportOpen

  return (
    <div className="relative mx-auto h-9 w-full max-w-3xl">
      {!data ? null : expanded ? (
        <Card
          report={(data as Extract<ReportStatus, { status: "ready" }>).report}
          failure={(data as Extract<ReportStatus, { status: "ready" }>).error}
          busy={busy}
          onRun={run}
          onCollapse={() => set("reportOpen", false)}
        />
      ) : (
        <div className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-black/40 pl-4 pr-2 backdrop-blur">
          {data.status === "ready" ? (
            <>
              <button
                onClick={() => set("reportOpen", true)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                {data.error ? (
                  <AlertCircle size={13} className="shrink-0 text-red-300" />
                ) : (
                  <Sparkles size={13} className="shrink-0 text-accent" />
                )}
                <span className="truncate text-[13px] text-white/80">{data.report.headline}</span>
              </button>
              <ChevronDown size={14} className="shrink-0 text-white/35" />
            </>
          ) : data.status === "running" || busy ? (
            <span className="flex flex-1 items-center gap-2.5 text-[13px] text-white/55">
              <span className="spinner h-3.5 w-3.5" />
              Writing up your day
              <Dots />
            </span>
          ) : data.status === "error" ? (
            <>
              <span className="flex min-w-0 flex-1 items-center gap-2.5 text-[13px] text-red-300">
                <AlertCircle size={13} className="shrink-0" />
                <span className="truncate" title={data.message}>
                  {data.message}
                </span>
              </span>
              <RunButton onClick={run} busy={busy} label="Try again" />
            </>
          ) : (
            <>
              <span className="flex flex-1 items-center gap-2.5 text-[13px] text-white/45">
                <Sparkles size={13} className="shrink-0 text-accent/70" />
                Daily report in {timeUntil(data.status === "pending" ? data.dueAt : new Date().toISOString())}
              </span>
              <RunButton onClick={run} busy={busy} label="Run now" />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Card({
  report,
  failure,
  busy,
  onRun,
  onCollapse,
}: {
  report: Report
  /** A re-run that failed; the report shown is the last good one */
  failure?: string
  busy: boolean
  onRun: () => void
  onCollapse: () => void
}) {
  const { settings } = useSettings()
  const linearInApp = settings.linearInApp

  return (
    <div className="surface-strong animate-fade-in absolute inset-x-0 top-0 z-30">
      {busy && (
        <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden rounded-t-2xl bg-white/5">
          <div className="h-full w-1/3 rounded-full bg-accent [animation:sweep_1.3s_ease-in-out_infinite]" />
        </div>
      )}
      {/* the header doubles as the collapsed pill, so it can't be one big button */}
      <div className="flex items-start gap-3 px-4 pb-2.5 pt-3">
        <button onClick={onCollapse} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
          <Sparkles size={14} className="mt-[3px] shrink-0 text-accent" />
          <span className="text-[15px] font-medium leading-snug text-white/90">{report.headline}</span>
        </button>
        <RunButton onClick={onRun} busy={busy} label="Run again" />
        <button onClick={onCollapse} aria-label="Collapse the report" className="shrink-0 pt-1 text-white/35 transition hover:text-white">
          <ChevronUp size={15} />
        </button>
      </div>

      <div className="thin-scroll max-h-[60vh] overflow-y-auto px-4 pb-4">
        <Stats report={report} />

        {report.issues.length > 0 && (
          <Block title="Completed">
            <div className="space-y-2.5">
              {report.issues.map((i) => (
                <div key={i.identifier}>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <a
                      href={linearHref(i.url, linearInApp)}
                      target={linearInApp ? undefined : "_blank"}
                      rel="noreferrer"
                      className="font-mono text-[11px] text-accent hover:underline"
                    >
                      {i.identifier}
                    </a>
                    <span className="text-[13px] text-white/90">{i.title}</span>
                    {i.points != null && (
                      <span className="rounded-full border border-white/15 px-1.5 font-mono text-[10px] text-white/45">
                        {i.points} pts
                      </span>
                    )}
                    {i.prs.map((p) => (
                      <Pr key={p.label} pr={p} />
                    ))}
                  </div>
                  {i.note && <p className="mt-0.5 text-[12px] leading-snug text-white/55">{i.note}</p>}
                </div>
              ))}
            </div>
          </Block>
        )}

        {report.repos.length > 0 && (
          <Block title="By repo">
            <div className="space-y-1.5">
              {report.repos.map((r) => (
                <div key={r.repo} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[11px] text-white/70">{r.repo}</span>
                  {r.prs.map((p) => (
                    <Pr key={p.label} pr={p} compact />
                  ))}
                  {r.note && <span className="text-[12px] leading-snug text-white/55">{r.note}</span>}
                </div>
              ))}
            </div>
          </Block>
        )}

        {report.communication.length > 0 && (
          <Block title="Communication">
            <Bullets items={report.communication} />
          </Block>
        )}

        {report.other.length > 0 && (
          <Block title="Also">
            <Bullets items={report.other} />
          </Block>
        )}

        {(report.meetings.note || report.meetings.attended > 0 || report.meetings.upcoming > 0) && (
          <Block title="Meetings">
            <p className="text-[12px] leading-snug text-white/60">
              {report.meetings.note || `${report.meetings.attended} so far`}
              {report.meetings.upcoming > 0 && (
                <span className="text-white/35">
                  {" "}
                  · {report.meetings.upcoming} still to come
                </span>
              )}
            </p>
          </Block>
        )}

        {failure && (
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-red-300">
            <AlertCircle size={11} className="mt-0.5 shrink-0" />
            Couldn&apos;t rewrite it just now: {failure}
          </p>
        )}

        {report.errors.length > 0 && (
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-amber-300/70">
            <AlertCircle size={11} className="mt-0.5 shrink-0" />
            {report.errors.map((e) => `${e.source}: ${e.message}`).join(" · ")}
          </p>
        )}

        <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-white/25">
          Covers midnight to{" "}
          {new Date(report.coversUntil).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </p>
      </div>
    </div>
  )
}

/** A labelled run of content inside the card. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3.5 border-t border-white/10 pt-3 first:mt-0 first:border-0 first:pt-0">
      <h3 className="label-xs mb-2">{title}</h3>
      {children}
    </section>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((b, i) => (
        <li key={i} className="flex gap-2 text-[12px] leading-snug text-white/65">
          <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-accent" />
          {b}
        </li>
      ))}
    </ul>
  )
}

/** A pull request chip; filled when it was merged, outlined when still open. */
function Pr({ pr, compact }: { pr: PrRef; compact?: boolean }) {
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      title={pr.merged ? "Merged" : "Open"}
      className={clsx(
        "rounded-full border px-1.5 font-mono text-[10px] transition hover:border-accent/60",
        pr.merged
          ? "border-accent/40 bg-accent/15 text-white/80"
          : "border-white/15 text-white/45",
        compact && "shrink-0",
      )}
    >
      {pr.label}
    </a>
  )
}

function Stats({ report }: { report: Report }) {
  const t = report.totals
  const stats: [string, string | number][] = [
    ["PRs merged", t.prsMerged],
    ...(t.prsOpened > t.prsMerged ? ([["PRs opened", t.prsOpened]] as [string, number][]) : []),
    ...(t.prsReviewed ? ([["reviewed", t.prsReviewed]] as [string, number][]) : []),
    ["issues closed", t.issuesClosed],
    ["story points", t.points],
    ...(t.repos ? ([["repos", t.repos]] as [string, number][]) : []),
    ...(t.meetings ? ([["meetings", `${t.meetings} · ${t.meetingMinutes}m`]] as [string, string][]) : []),
  ]
  return (
    <div className="flex flex-wrap gap-x-7 gap-y-2 border-y border-white/10 py-2.5">
      {stats.map(([label, value]) => (
        <div key={label}>
          <div className="text-[15px] font-light tabular-nums text-white/90">{value}</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">{label}</div>
        </div>
      ))}
    </div>
  )
}

function RunButton({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/55 transition hover:border-accent/50 hover:text-white disabled:opacity-40"
    >
      {busy ? (
        <>
          <span className="spinner h-3 w-3" />
          Writing…
        </>
      ) : (
        <>
          {label === "Run now" ? <Play size={10} /> : <RefreshCw size={11} />}
          {label}
        </>
      )}
    </button>
  )
}
