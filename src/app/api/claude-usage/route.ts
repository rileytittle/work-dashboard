import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
const TTL_MS = 60_000
/** How long a failed refresh may fall back to the last good numbers */
const STALE_MS = 10 * 60_000
const execFileAsync = promisify(execFile)

export type UsageLimit = {
  /** "session" (5-hour), "weekly_all", "weekly_scoped" (one model) */
  kind: string
  label: string
  percent: number
  resetsAt: string | null
}

export type ClaudeUsage =
  | { ok: true; limits: UsageLimit[]; fetchedAt: number; /** why the numbers are old, when they are */ stale?: string }
  | { ok: false; reason: string }

type Window = { utilization: number | null; resets_at: string | null } | null

type UsageResponse = {
  limits?: {
    kind: string
    percent: number | null
    resets_at: string | null
    scope: { model?: { display_name?: string | null } | null } | null
  }[]
  five_hour?: Window
  seven_day?: Window
  seven_day_opus?: Window
  seven_day_sonnet?: Window
}

type Credentials = { claudeAiOauth?: { accessToken?: string; expiresAt?: number } }

/** Claude Code's OAuth login: the macOS keychain, or ~/.claude/.credentials.json elsewhere. Never leaves the server. */
async function readToken() {
  let raw: string | null = null
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], { timeout: 5000 })
      raw = stdout
    } catch {
      // not in the keychain; try the file
    }
  }
  raw ??= await readFile(path.join(os.homedir(), ".claude", ".credentials.json"), "utf8").catch(() => null)
  if (!raw) throw new Error("Not signed in to Claude Code")

  let creds: Credentials
  try {
    creds = JSON.parse(raw)
  } catch {
    // the parse error would quote the secret, so swallow it
    throw new Error("Can't read Claude Code credentials")
  }
  const oauth = creds.claudeAiOauth
  if (!oauth?.accessToken) throw new Error("Claude Code isn't using a Claude.ai login")
  // Claude Code refreshes the token itself whenever it runs; we only read it
  if (oauth.expiresAt && oauth.expiresAt < Date.now()) throw new Error("Login expired, open Claude Code to refresh")
  return oauth.accessToken
}

/** The `limits` list /usage renders, or the older per-window fields when it's missing. */
function toLimits(u: UsageResponse): UsageLimit[] {
  if (u.limits?.length) {
    return u.limits
      .filter((l) => l.percent != null)
      .map((l) => ({
        kind: l.kind,
        label:
          l.kind === "session"
            ? "Session · 5h"
            : l.kind === "weekly_all"
              ? "Weekly · all models"
              : `Weekly · ${l.scope?.model?.display_name ?? l.kind.replace(/_/g, " ")}`,
        percent: l.percent!,
        resetsAt: l.resets_at,
      }))
  }
  const windows: [string, string, Window | undefined][] = [
    ["session", "Session · 5h", u.five_hour],
    ["weekly_all", "Weekly · all models", u.seven_day],
    ["weekly_scoped", "Weekly · Opus", u.seven_day_opus],
    ["weekly_scoped", "Weekly · Sonnet", u.seven_day_sonnet],
  ]
  return windows
    .filter(([, , w]) => w?.utilization != null)
    .map(([kind, label, w]) => ({ kind, label, percent: Math.round(w!.utilization!), resetsAt: w!.resets_at }))
}

async function fetchUsage(): Promise<ClaudeUsage> {
  const token = await readToken()
  let res: Response
  try {
    res = await fetch(USAGE_URL, {
      headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Error("Can't reach api.anthropic.com")
  }
  if (res.status === 401) throw new Error("Login expired, open Claude Code to refresh")
  if (res.status === 429) throw new Error("Rate limited, retrying shortly")
  if (!res.ok) throw new Error(`Usage API returned ${res.status}`)
  const limits = toLimits(await res.json())
  if (!limits.length) throw new Error("No plan limits on this account")
  return { ok: true, limits, fetchedAt: Date.now() }
}

type Cache = { at: number; pending: Promise<ClaudeUsage> | null; lastGood: Extract<ClaudeUsage, { ok: true }> | null }

/** Survives dev hot reloads; one upstream call per TTL however many tabs poll. */
const cache: Cache = ((globalThis as { claudeUsage?: Cache }).claudeUsage ??= { at: 0, pending: null, lastGood: null })

async function load(): Promise<ClaudeUsage> {
  try {
    const usage = await fetchUsage()
    if (usage.ok) cache.lastGood = usage
    return usage
  } catch (err) {
    const reason = (err as Error).message
    const last = cache.lastGood
    if (last && Date.now() - last.fetchedAt < STALE_MS) return { ...last, stale: reason }
    return { ok: false, reason }
  }
}

export async function GET() {
  if (!cache.pending || Date.now() - cache.at > TTL_MS) {
    cache.at = Date.now()
    cache.pending = load()
  }
  return NextResponse.json(await cache.pending)
}
