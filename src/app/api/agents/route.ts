import { execFile } from "node:child_process"
import { open, readdir, readFile, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const CLAUDE_DIR = path.join(os.homedir(), ".claude")
const TAIL_BYTES = 512 * 1024
const execFileAsync = promisify(execFile)

export type Agent = {
  /** Stable while the session lives; freed numbers are reused, lowest first */
  number: number
  pid: number
  sessionId: string
  name: string
  title: string | null
  project: string
  /** "busy" = working, "idle" = done / waiting on you; anything else is passed through */
  status: string
  statusSince: number
  lastPrompt: string | null
  entrypoint: string | null
  /** Git branch the agent is currently working in */
  branch: string | null
}

type SessionFile = {
  pid: number
  sessionId: string
  cwd?: string
  startedAt?: number
  name?: string
  status?: string
  statusUpdatedAt?: number
  updatedAt?: number
  entrypoint?: string
}

/** Claude Code keeps one sessions/<pid>.json per running process; stale files outlive crashed ones. */
function isAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM"
  }
}

/** Survives dev hot reloads so numbers don't reshuffle on every edit. */
const numbers: Map<string, number> = ((globalThis as { agentNumbers?: Map<string, number> }).agentNumbers ??= new Map())

/** Keep each live session's number; hand the lowest free numbers to new ones, oldest first. */
function assignNumbers(live: SessionFile[]) {
  const ids = new Set(live.map((s) => s.sessionId))
  for (const id of numbers.keys()) if (!ids.has(id)) numbers.delete(id)
  const taken = new Set(numbers.values())
  let n = 1
  for (const s of [...live].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))) {
    if (numbers.has(s.sessionId)) continue
    while (taken.has(n)) n++
    numbers.set(s.sessionId, n)
    taken.add(n)
  }
}

/** Live branch of the repo at `cwd`; null when detached or not a repo. */
async function liveBranch(cwd: string) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, "branch", "--show-current"], { timeout: 2000 })
    return stdout.trim() || null
  } catch {
    return null
  }
}

/** Latest AI-generated title, prompt, cwd and branch from the tail of the session transcript. */
async function transcriptInfo(cwd: string | undefined, sessionId: string) {
  const file = `${sessionId}.jsonl`
  const guess = cwd ? path.join(CLAUDE_DIR, "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"), file) : null
  let found = guess && (await stat(guess).catch(() => null)) ? guess : null
  if (!found) {
    const dirs = await readdir(path.join(CLAUDE_DIR, "projects")).catch(() => [])
    for (const d of dirs) {
      const p = path.join(CLAUDE_DIR, "projects", d, file)
      if (await stat(p).catch(() => null)) {
        found = p
        break
      }
    }
  }
  if (!found) return { title: null, lastPrompt: null, cwd: null, branch: null }

  const fh = await open(found, "r")
  try {
    const { size } = await fh.stat()
    const start = Math.max(0, size - TAIL_BYTES)
    const buf = Buffer.alloc(size - start)
    await fh.read(buf, 0, buf.length, start)
    let title: string | null = null
    let lastPrompt: string | null = null
    let lastCwd: string | null = null
    let branch: string | null = null
    for (const line of buf.toString("utf8").split("\n")) {
      // every message records where the agent was; the last one wins (tracks worktrees / cd)
      lastCwd = line.match(/"cwd":"([^"]+)"/)?.[1] ?? lastCwd
      branch = line.match(/"gitBranch":"([^"]+)"/)?.[1] ?? branch
      if (!line.includes('"ai-title"') && !line.includes('"last-prompt"')) continue
      try {
        const d = JSON.parse(line)
        if (d.type === "ai-title" && d.aiTitle) title = d.aiTitle
        if (d.type === "last-prompt" && d.lastPrompt) lastPrompt = d.lastPrompt
      } catch {
        // first line of the tail may be cut mid-record
      }
    }
    return { title, lastPrompt: lastPrompt ? lastPrompt.replace(/\s+/g, " ").slice(0, 200) : null, cwd: lastCwd, branch }
  } finally {
    await fh.close()
  }
}

export async function GET() {
  const dir = path.join(CLAUDE_DIR, "sessions")
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json"))

  const sessions = await Promise.all(
    files.map(async (f) => {
      try {
        return JSON.parse(await readFile(path.join(dir, f), "utf8")) as SessionFile
      } catch {
        return null
      }
    }),
  )

  const live = sessions.filter((s): s is SessionFile => !!s?.pid && !!s.sessionId && isAlive(s.pid))
  assignNumbers(live)

  const agents: Agent[] = await Promise.all(
    live.map(async (s) => {
      const { title, lastPrompt, cwd, branch } = await transcriptInfo(s.cwd, s.sessionId)
      const where = cwd ?? s.cwd
      return {
        number: numbers.get(s.sessionId)!,
        pid: s.pid,
        sessionId: s.sessionId,
        name: s.name ?? `claude-${s.pid}`,
        title,
        project: s.cwd ? path.basename(s.cwd) : "",
        status: s.status ?? "idle",
        statusSince: s.statusUpdatedAt ?? s.updatedAt ?? 0,
        lastPrompt,
        entrypoint: s.entrypoint ?? null,
        // live checkout beats the transcript, which only updates when the agent sends a message
        branch: (where && (await liveBranch(where))) ?? branch,
      }
    }),
  )

  // working first, then most recently changed
  agents.sort((a, b) => Number(b.status === "busy") - Number(a.status === "busy") || b.statusSince - a.statusSince)
  return NextResponse.json({ agents })
}
