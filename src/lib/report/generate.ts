import { hasLinearKey } from "@/lib/linear"
import { runClaude, parseJsonAnswer } from "./claude"
import { dayWindow } from "./day"
import { buildPrompt, prLabel } from "./prompt"
import { notifyFailed, notifyReady } from "./notify"
import { collectGithub } from "./sources/github"
import { collectLinear } from "./sources/linear"
import { readReport, writeReport } from "./store"
import type { DayData, PrRef, Report, ReportIssue, ReportRepo, SourceError } from "./types"

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
  issues?: { identifier?: string; prs?: string[]; note?: string }[]
  repos?: { repo?: string; note?: string }[]
  communication?: string[]
  meetings?: { attended?: number; minutes?: number; upcoming?: number; note?: string }
  other?: string[]
}

const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : 0)
const line = (s: unknown) => (typeof s === "string" ? s.trim() : "")
const shortRepo = (repo: string) => repo.split("/")[1] ?? repo

/**
 * Collects the day, has Claude fill in the rest and write it up, then saves it.
 *
 * Claude only supplies judgement — which pull request belongs to which issue, and
 * a sentence about each. Every name, number and link is taken from the data we
 * fetched, so nothing in the report can be invented.
 */
export async function generateReport(now = new Date()): Promise<Report> {
  const data = await collectDay(now)
  const answer = parseJsonAnswer<Answer>(await runClaude(buildPrompt(data, now)))

  // every pull request of the day, by the label Claude was told to use
  const allPrs = [...(data.github?.merged ?? []), ...(data.github?.opened ?? [])]
  const mergedUrls = new Set((data.github?.merged ?? []).map((p) => p.url))
  const prByLabel = new Map<string, PrRef>()
  for (const p of allPrs) {
    const label = prLabel(p.repo, p.number)
    if (!prByLabel.has(label)) {
      prByLabel.set(label, { label, url: p.url, merged: mergedUrls.has(p.url) })
    }
  }

  const notesByIssue = new Map<string, { note: string; prs: string[] }>()
  for (const i of answer.issues ?? []) {
    const id = line(i.identifier)
    if (id) notesByIssue.set(id, { note: line(i.note), prs: (i.prs ?? []).map(line).filter(Boolean) })
  }

  // the issue list is ours; Claude only annotates it
  const claimed = new Set<string>()
  const issues: ReportIssue[] = (data.linear?.completed ?? []).map((i) => {
    const said = notesByIssue.get(i.identifier)
    const prs = (said?.prs ?? [])
      .map((label) => prByLabel.get(label))
      .filter((p): p is PrRef => !!p)
    prs.forEach((p) => claimed.add(p.label))
    return {
      identifier: i.identifier,
      title: i.title,
      url: i.url,
      points: i.estimate,
      prs,
      note: said?.note ?? "",
    }
  })

  const notesByRepo = new Map<string, string>()
  for (const r of answer.repos ?? []) {
    const name = line(r.repo)
    if (name) notesByRepo.set(shortRepo(name), line(r.note))
  }

  const byRepo = new Map<string, PrRef[]>()
  for (const p of allPrs) {
    const name = shortRepo(p.repo)
    const list = byRepo.get(name) ?? []
    const ref = prByLabel.get(prLabel(p.repo, p.number))
    if (ref && !list.some((x) => x.label === ref.label)) list.push(ref)
    byRepo.set(name, list)
  }

  const repos: ReportRepo[] = [...byRepo]
    .map(([repo, prs]) => ({ repo, prs, note: notesByRepo.get(repo) ?? "" }))
    .sort((a, b) => b.prs.length - a.prs.length)

  const report: Report = {
    version: 2,
    date: data.date,
    generatedAt: new Date().toISOString(),
    coversUntil: now.toISOString(),
    headline: line(answer.headline) || "Your day so far",
    issues,
    repos,
    communication: (answer.communication ?? []).map(line).filter(Boolean).slice(0, 4),
    meetings: {
      attended: count(answer.meetings?.attended),
      minutes: count(answer.meetings?.minutes),
      upcoming: count(answer.meetings?.upcoming),
      note: line(answer.meetings?.note),
    },
    other: (answer.other ?? []).map(line).filter(Boolean).slice(0, 3),
    totals: {
      prsOpened: data.github?.opened.length ?? 0,
      prsMerged: data.github?.merged.length ?? 0,
      prsReviewed: data.github?.reviewed.length ?? 0,
      issuesClosed: issues.length,
      points: data.linear?.points ?? 0,
      repos: repos.length,
      meetings: count(answer.meetings?.attended),
      meetingMinutes: count(answer.meetings?.minutes),
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
