import { hasLinearKey } from "@/lib/linear"
import { runClaude, parseJsonAnswer } from "./claude"
import { dayWindow } from "./day"
import { buildPrompt } from "./prompt"
import { notifyFailed, notifyReady } from "./notify"
import { collectGithub } from "./sources/github"
import { collectLinear } from "./sources/linear"
import { readReport, writeReport } from "./store"
import type { DayData, Report, SourceError } from "./types"

/**
 * The parts we fetch ourselves, because they need to be exact: pull requests and
 * issues. Meetings and Slack are read by Claude through its own connectors while
 * it writes the summary, so they need no credentials here.
 */
export async function collectDay(now = new Date()): Promise<DayData> {
  const { date, from, to } = dayWindow(now)
  const errors: SourceError[] = []

  const attempt = async <T>(source: string, enabled: boolean, fn: () => Promise<T>): Promise<T | null> => {
    if (!enabled) return null
    try {
      return await fn()
    } catch (err) {
      errors.push({ source, message: (err as Error).message })
      return null
    }
  }

  const [github, linear] = await Promise.all([
    attempt("GitHub", true, () => collectGithub(from)),
    attempt("Linear", hasLinearKey(), () => collectLinear(from)),
  ])

  return { date, from: from.toISOString(), to: to.toISOString(), github, linear, errors }
}

type Answer = {
  headline?: string
  sections?: { title?: string; bullets?: string[] }[]
  stats?: { label?: string; value?: string }[]
  counts?: { meetings?: number; meetingMinutes?: number; slackMessages?: number }
}

const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : 0)

/** Collects the day, has Claude fill in the rest and write it up, then saves it. */
export async function generateReport(now = new Date()): Promise<Report> {
  const data = await collectDay(now)
  const answer = parseJsonAnswer<Answer>(await runClaude(buildPrompt(data)))

  const report: Report = {
    date: data.date,
    generatedAt: new Date().toISOString(),
    headline: answer.headline?.trim() || "Your day",
    sections: (answer.sections ?? [])
      .map((s) => ({ title: s.title?.trim() ?? "", bullets: (s.bullets ?? []).map((b) => b.trim()).filter(Boolean) }))
      .filter((s) => s.title && s.bullets.length),
    stats: (answer.stats ?? [])
      .map((s) => ({ label: s.label?.trim() ?? "", value: String(s.value ?? "").trim() }))
      .filter((s) => s.label && s.value),
    totals: {
      prsOpened: data.github?.opened.length ?? 0,
      prsMerged: data.github?.merged.length ?? 0,
      prsReviewed: data.github?.reviewed.length ?? 0,
      issuesClosed: data.linear?.completed.length ?? 0,
      points: data.linear?.points ?? 0,
      // these three are Claude's own count, from the connectors
      meetings: count(answer.counts?.meetings),
      meetingMinutes: count(answer.counts?.meetingMinutes),
      slackMessages: count(answer.counts?.slackMessages),
    },
    errors: data.errors,
  }

  await writeReport(report)
  return report
}

/**
 * One run at a time, however many tabs are open. Survives dev hot reloads, and
 * remembers the last failure so the pill can show it instead of retrying forever.
 */
type Runs = { running: Map<string, Promise<Report>>; failed: Map<string, string> }
const runs: Runs = ((globalThis as { reportRuns?: Runs }).reportRuns ??= { running: new Map(), failed: new Map() })

export const isRunning = (date: string) => runs.running.has(date)
export const lastFailure = (date: string) => runs.failed.get(date) ?? null

/**
 * Starts a run if one isn't already going; returns the promise either way.
 * `notify` is on for the run that fires by itself at 4:40 and off when you
 * pressed the button, since you are already looking at it.
 */
export function startRun(date: string, now = new Date(), notify = true): Promise<Report> {
  const existing = runs.running.get(date)
  if (existing) return existing

  runs.failed.delete(date)
  const run = generateReport(now)
    .then((report) => {
      if (notify) notifyReady(report.headline)
      return report
    })
    .catch((err: Error) => {
      runs.failed.set(date, err.message)
      if (notify) notifyFailed(err.message)
      throw err
    })
    .finally(() => runs.running.delete(date))

  runs.running.set(date, run)
  // the caller polls; an unhandled rejection here would take the server down
  run.catch(() => {})
  return run
}

export { readReport }
