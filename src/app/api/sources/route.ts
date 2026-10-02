import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { NextResponse } from "next/server"
import { hasLinearKey } from "@/lib/linear"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const execFileAsync = promisify(execFile)

export type SourceState = {
  id: string
  label: string
  configured: boolean
  note?: string
}

/**
 * Which of Claude's own connectors are up. `claude mcp list` pings each one, so
 * this is cached — it takes a few seconds.
 */
type Connectors = { calendar: boolean; slack: boolean; claude: boolean }
let cached: { at: number; value: Promise<Connectors> } | null = null

async function connectors(): Promise<Connectors> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value
  const value = execFileAsync("claude", ["mcp", "list"], { timeout: 30_000 }).then(
    ({ stdout }) => ({
      calendar: /Google Calendar.*Connected/i.test(stdout),
      slack: /Slack.*Connected/i.test(stdout),
      claude: true,
    }),
    () => ({ calendar: false, slack: false, claude: false }),
  )
  cached = { at: Date.now(), value }
  return value
}

/** What the daily report can and can't read right now. */
export async function GET() {
  const c = await connectors()

  const sources: SourceState[] = [
    { id: "github", label: "GitHub", configured: true, note: "your git login or GITHUB_TOKEN" },
    { id: "linear", label: "Linear", configured: hasLinearKey(), note: "LINEAR_API_KEY" },
    { id: "claude", label: "Claude Code", configured: c.claude, note: "the `claude` command" },
    {
      id: "calendar",
      label: "Calendar · via Claude",
      configured: c.calendar,
      note: "the Google Calendar connector in Claude",
    },
    { id: "slack", label: "Slack · via Claude", configured: c.slack, note: "the Slack connector in Claude" },
  ]

  return NextResponse.json({ sources })
}
