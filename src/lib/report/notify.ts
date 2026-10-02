import { execFile } from "node:child_process"

/**
 * Tells macOS the report is ready. Uses terminal-notifier when it's installed,
 * because that makes the banner clickable; otherwise osascript, which shows the
 * same banner but does nothing when clicked.
 *
 * Never throws: a missing notifier must not take a finished report down with it.
 */

const URL = "http://127.0.0.1:3000"

let notifier: Promise<string | null> | null = null

function findNotifier(): Promise<string | null> {
  notifier ??= new Promise((resolve) => {
    execFile("which", ["terminal-notifier"], { timeout: 3000 }, (err, stdout) =>
      resolve(err ? null : stdout.trim() || null),
    )
  })
  return notifier
}

/** AppleScript string literals take the same escapes as JSON, minus the quotes. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

const run = (file: string, args: string[]) =>
  new Promise<void>((resolve) => execFile(file, args, { timeout: 8000 }, () => resolve()))

async function notify(title: string, subtitle: string, message: string) {
  const tn = await findNotifier()
  if (tn) {
    await run(tn, [
      "-title", title,
      "-subtitle", subtitle,
      "-message", message,
      // clicking the banner opens the dashboard
      "-open", URL,
      // one slot, so a re-run replaces the old banner instead of stacking
      "-group", "work-dashboard-report",
    ])
    return
  }
  const script = `display notification "${esc(message)}" with title "${esc(title)}" subtitle "${esc(subtitle)}"`
  await run("osascript", ["-e", script])
}

export function notifyReady(headline: string) {
  return notify("Dashboard", "Your day is written up", headline).catch(() => {})
}

export function notifyFailed(reason: string) {
  return notify("Dashboard", "Couldn't write today's report", reason).catch(() => {})
}
