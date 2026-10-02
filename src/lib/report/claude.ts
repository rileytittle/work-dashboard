import { spawn } from "node:child_process"
import os from "node:os"

/**
 * Runs the Claude Code CLI in print mode and returns what it wrote.
 *
 * The run is allowed to reach your Google Calendar and Slack through the
 * connectors Claude already has, which is why the report needs no calendar or
 * Slack credentials of its own. Everything that writes, runs commands or
 * browses the web is denied; --no-session-persistence keeps these runs out of
 * the Agents panel; and the prompt goes in on stdin so a busy day can't blow
 * the argument limit.
 */

/** Connectors the report is allowed to use, by their claude.ai server names. */
export const REPORT_CONNECTORS = ["mcp__claude_ai_Google_Calendar", "mcp__claude_ai_Slack"]

const DENIED = ["Bash", "Write", "Edit", "NotebookEdit", "WebFetch", "WebSearch", "Task"]

export function runClaude(prompt: string, timeoutMs = 240_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "-p",
        "--output-format", "json",
        "--no-session-persistence",
        "--model", "sonnet",
        "--allowed-tools", REPORT_CONNECTORS.join(" "),
        "--disallowed-tools", DENIED.join(","),
      ],
      {
        // away from the project so no CLAUDE.md gets pulled in
        cwd: os.tmpdir(),
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    )

    let out = ""
    let err = ""
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error("Claude took too long to answer"))
    }, timeoutMs)

    child.stdout.on("data", (c) => (out += c))
    child.stderr.on("data", (c) => (err += c))

    child.on("error", (e) => {
      clearTimeout(timer)
      reject(
        (e as NodeJS.ErrnoException).code === "ENOENT"
          ? new Error("Couldn't find the `claude` command — is Claude Code installed and on your PATH?")
          : e,
      )
    })

    child.on("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(err.trim() || `claude exited with ${code}`))
      try {
        const env = JSON.parse(out) as { result?: string; is_error?: boolean; subtype?: string }
        if (env.is_error || typeof env.result !== "string") {
          return reject(new Error(env.result || `Claude returned ${env.subtype ?? "an error"}`))
        }
        resolve(env.result)
      } catch {
        reject(new Error("Couldn't read Claude's answer"))
      }
    })

    child.stdin.end(prompt)
  })
}

/** Pulls the JSON object out of an answer, tolerating ``` fences and stray prose. */
export function parseJsonAnswer<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced?.[1] ?? text).trim()
  try {
    return JSON.parse(body) as T
  } catch {
    const start = body.indexOf("{")
    const end = body.lastIndexOf("}")
    if (start === -1 || end <= start) throw new Error("Claude didn't answer with JSON")
    return JSON.parse(body.slice(start, end + 1)) as T
  }
}
