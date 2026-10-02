import { NextResponse } from "next/server"
import { dueAt, isDue, localDate } from "@/lib/report/day"
import { isRunning, lastFailure, readReport, startRun } from "@/lib/report/generate"
import type { ReportStatus } from "@/lib/report/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * There is no scheduler: the first time the dashboard asks after the report is
 * due, the run starts here. Whoever asks next sees it running, then ready.
 */
export async function GET() {
  const now = new Date()
  const date = localDate(now)

  // a re-run keeps today's saved copy on screen until the new one lands,
  // so the running flag rides along with the report rather than replacing it
  const running = isRunning(date)
  const failed = lastFailure(date)
  const saved = await readReport(date)

  // a re-run that failed still shows the saved copy, but says so rather than
  // quietly leaving the old report on screen
  if (saved) return json({ status: "ready", date, report: saved, running, error: failed ?? undefined })
  if (running) return json({ status: "running", date })
  if (failed) return json({ status: "error", date, message: failed })

  if (!isDue(now)) return json({ status: "pending", date, dueAt: dueAt(now).toISOString() })

  startRun(date, now)
  return json({ status: "running", date })
}

/** Run it now, whatever the time, replacing today's report if there is one. */
export async function POST() {
  const now = new Date()
  const date = localDate(now)
  // you pressed the button, so no banner — the card already shows it working
  if (!isRunning(date)) startRun(date, now, false)
  return json({ status: "running", date })
}

const json = (s: ReportStatus) => NextResponse.json(s)
