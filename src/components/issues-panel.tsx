"use client"

import clsx from "clsx"
import { ChevronRight, CircleAlert, CircleCheck } from "lucide-react"
import type { Agent } from "@/app/api/agents/route"
import type { LinearCard } from "@/app/api/linear/route"
import { linearHref, useSettings } from "@/lib/settings"
import { span, timeLeft } from "@/lib/time"
import { usePoll } from "@/lib/use-poll"
import { Panel, PanelLoading, PanelMessage, PanelMeta } from "./panel"

const STATE_ORDER = ["started", "unstarted", "triage", "backlog"]

function Priority({ p }: { p: number }) {
  if (p === 1) {
    return (
      <span
        title="Urgent"
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] bg-red-400 text-[10px] font-bold text-red-950"
      >
        !
      </span>
    )
  }
  const level = p === 0 ? 0 : 5 - p // high = 3 bars, medium = 2, low = 1
  return (
    <span
      className="flex h-3 shrink-0 items-end gap-[2px]"
      title={["No priority", "", "High", "Medium", "Low"][p] ?? "No priority"}
    >
      {[1, 2, 3].map((b) => (
        <span
          key={b}
          className={clsx("w-[3px] rounded-[1px]", b <= level ? "bg-white/80" : "bg-white/20")}
          style={{ height: `${b * 33}%` }}
        />
      ))}
    </span>
  )
}

type SlaRisk = "breached" | "high" | "medium" | "low"

/** Linear's SLA bands: breached, then high risk, medium risk, on track. */
function slaStatus(i: LinearCard): { risk: SlaRisk; label: string; breach: Date } | null {
  if (!i.slaBreachesAt) return null
  const now = Date.now()
  const breach = new Date(i.slaBreachesAt)
  const left = breach.getTime() - now
  const past = (iso: string | null) => !!iso && new Date(iso).getTime() <= now
  const risk: SlaRisk =
    left <= 0 ? "breached" : past(i.slaHighRiskAt) ? "high" : past(i.slaMediumRiskAt) ? "medium" : "low"
  return { risk, breach, label: left <= 0 ? `breached ${span(left)} ago` : `${span(left)} left` }
}

const SLA_TONE: Record<SlaRisk, string> = {
  breached: "border-red-400/60 bg-red-400/20 text-red-200",
  high: "border-red-400/40 bg-red-400/10 text-red-300",
  medium: "border-amber-300/40 bg-amber-300/10 text-amber-300",
  low: "border-white/15 text-white/40",
}

function Sla({ i }: { i: LinearCard }) {
  const sla = slaStatus(i)
  if (!sla) return null
  return (
    <span
      title={`SLA breaches ${sla.breach.toLocaleString()}`}
      className={clsx("ml-auto shrink-0 rounded-full border px-1.5 font-mono text-[10px]", SLA_TONE[sla.risk])}
    >
      SLA {sla.label}
    </span>
  )
}

/** True when a branch is Linear's suggested one, or carries the identifier (e.g. "fix/eng-123-foo"). */
function onCard(branch: string, i: LinearCard) {
  const b = branch.toLowerCase()
  if (i.branchName && b === i.branchName.toLowerCase()) return true
  return new RegExp(`(^|[^a-z0-9])${i.identifier.toLowerCase()}($|[^0-9])`).test(b)
}

/** Marks an issue a Claude Code session is working in right now. */
function AgentChip({ a }: { a: Agent }) {
  const working = a.status === "busy"
  const done = a.status === "idle"
  return (
    <span
      title={`Agent #${a.number}: ${a.title ?? a.name} — ${working ? "working" : done ? "done" : a.status} on ${a.branch}`}
      className={clsx(
        "flex shrink-0 items-center gap-1 rounded-full border px-1.5 font-mono text-[10px]",
        working
          ? "border-accent/50 bg-accent/10 text-accent"
          : done
            ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-400"
            : "border-amber-300/50 bg-amber-300/10 text-amber-300",
      )}
    >
      {working ? (
        <span className="spinner h-2.5 w-2.5" />
      ) : done ? (
        <CircleCheck size={10} />
      ) : (
        <CircleAlert size={10} />
      )}
      #{a.number}
    </span>
  )
}

function PointsSummary({ all }: { all: LinearCard[] }) {
  let open = 0
  let done = 0
  for (const i of all) {
    if (i.state.type === "completed") done += i.estimate ?? 0
    else open += i.estimate ?? 0
  }
  const total = open + done
  return (
    <div className="text-[11px] text-white/45">
      <div className="flex items-baseline justify-between">
        <span className="uppercase tracking-[0.2em]">Points</span>
        <span className="font-mono">
          <span className="text-white/80">{open}</span> open · <span className="text-white/80">{done}</span> done
        </span>
      </div>
      <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  )
}

function IssueCard({ i, agents }: { i: LinearCard; agents: Agent[] }) {
  const { settings } = useSettings()
  const inApp = settings.linearInApp

  return (
    <a
      href={linearHref(i.url, inApp)}
      // a linear:// link hands off to the app, so it must not open a blank tab
      target={inApp ? undefined : "_blank"}
      rel="noreferrer"
      className="row group"
    >
      <div className="mb-1 flex items-center gap-2">
        <Priority p={i.priority} />
        <span className="font-mono text-[11px] text-white/35">{i.identifier}</span>
        {agents.map((a) => (
          <AgentChip key={a.sessionId} a={a} />
        ))}
        <Sla i={i} />
      </div>
      <div className="line-clamp-2 text-[13px] text-white/85 group-hover:text-white">{i.title}</div>
      {i.labels.nodes.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {i.labels.nodes.map((l) => (
            <span
              key={l.name}
              className="rounded-full border px-1.5 text-[10px] leading-[1.6]"
              style={{ borderColor: `${l.color}60`, color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
    </a>
  )
}

/** Triage issues assigned to you outside the active cycle, collapsed by default. */
function Triage({ items, agentsOn }: { items: LinearCard[]; agentsOn: (i: LinearCard) => Agent[] }) {
  const sorted = [...items].sort((a, b) => (a.priority || 5) - (b.priority || 5))
  return (
    <details className="group/t mt-1 border-t border-white/10 pt-1.5">
      <summary className="label-xs flex cursor-pointer items-center gap-2 px-2 py-1 transition hover:text-white/70">
        <ChevronRight size={11} className="transition-transform group-open/t:rotate-90" />
        In triage
        <span className="ml-auto font-mono tracking-normal text-white/25">{items.length}</span>
      </summary>
      <div className="mt-1">
        {sorted.map((i) => (
          <IssueCard key={i.id} i={i} agents={agentsOn(i)} />
        ))}
      </div>
    </details>
  )
}

/** Your Linear issues in the active cycle, grouped by status. */
export function IssuesPanel() {
  const { data, error, loading } = usePoll<{ issues: LinearCard[]; triage: LinearCard[] }>("/api/linear", 60_000)
  const { data: agentData } = usePoll<{ agents: Agent[] }>("/api/agents", 5000)

  const agents = agentData?.agents ?? []
  const agentsOn = (i: LinearCard) =>
    agents.filter((a) => a.branch && onCard(a.branch, i)).sort((a, b) => a.number - b.number)

  const all = data?.issues ?? []
  const triage = data?.triage ?? []
  const issues = all.filter((i) => i.state.type !== "completed")
  const cycle = all.find((i) => i.cycle)?.cycle

  const groups = new Map<string, { color: string; type: string; items: LinearCard[] }>()
  for (const i of issues) {
    const g = groups.get(i.state.name) ?? { color: i.state.color, type: i.state.type, items: [] }
    g.items.push(i)
    groups.set(i.state.name, g)
  }
  const sorted = [...groups].sort(([, a], [, b]) => STATE_ORDER.indexOf(a.type) - STATE_ORDER.indexOf(b.type))
  for (const [, g] of sorted) g.items.sort((a, b) => (a.priority || 5) - (b.priority || 5))

  return (
    <Panel
      title="Issues"
      meta={cycle && <PanelMeta main={`Cycle ${cycle.number}`} sub={`${issues.length} open · ${timeLeft(cycle.endsAt)}`} />}
      footer={all.length > 0 && <PointsSummary all={all} />}
    >
      {loading && !data ? (
        <PanelLoading />
      ) : error && !data ? (
        <PanelMessage>
          {/LINEAR_API_KEY/.test(error) ? (
            <>
              Add <code className="rounded bg-white/10 px-1 font-mono text-[11px] text-white/60">LINEAR_API_KEY</code>{" "}
              to <code className="rounded bg-white/10 px-1 font-mono text-[11px] text-white/60">.env.local</code> to see
              your issues.
            </>
          ) : (
            error
          )}
        </PanelMessage>
      ) : !issues.length ? (
        <PanelMessage>Nothing open in this cycle.</PanelMessage>
      ) : (
        sorted.map(([name, g]) => (
          <div key={name} className="mb-1.5">
            <div className="label-xs flex items-center gap-2 px-2 py-1.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: g.color, boxShadow: `0 0 7px ${g.color}` }}
              />
              {name}
              <span className="ml-auto font-mono tracking-normal text-white/25">{g.items.length}</span>
            </div>
            {g.items.map((i) => (
              <IssueCard key={i.id} i={i} agents={agentsOn(i)} />
            ))}
          </div>
        ))
      )}
      {triage.length > 0 && <Triage items={triage} agentsOn={agentsOn} />}
    </Panel>
  )
}
