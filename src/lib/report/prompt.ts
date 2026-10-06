import type { DayData } from "./types"

const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })

const shortRepo = (repo: string) => repo.split("/")[1] ?? repo
export const prLabel = (repo: string, number: number) => `${shortRepo(repo)}#${number}`

/** The day's facts, written out for Claude to reason over. */
function facts(d: DayData): string {
  const lines: string[] = []

  if (d.linear) {
    lines.push("## Linear issues you closed today")
    if (!d.linear.completed.length) lines.push("(none)")
    for (const i of d.linear.completed) {
      const pts = i.estimate ? `, ${i.estimate} points` : ""
      const proj = i.project ? `, project ${i.project}` : ""
      lines.push(`- ${i.identifier}${pts}${proj}: ${i.title}`)
    }
  }

  if (d.github) {
    const { opened, merged, reviewed } = d.github
    lines.push("", "## Pull requests")
    if (!opened.length && !merged.length && !reviewed.length) lines.push("(none)")
    for (const p of merged) lines.push(`- MERGED ${prLabel(p.repo, p.number)} (${p.repo}): ${p.title}`)
    for (const p of opened.filter((o) => !merged.some((m) => m.url === o.url))) {
      lines.push(`- open ${prLabel(p.repo, p.number)} (${p.repo}): ${p.title}`)
    }
    for (const p of reviewed) lines.push(`- you reviewed ${prLabel(p.repo, p.number)} by ${p.author}: ${p.title}`)
  }

  if (d.errors.length) {
    lines.push("", "## Sources that failed — say nothing about these")
    for (const e of d.errors) lines.push(`- ${e.source}: ${e.message}`)
  }

  return lines.join("\n")
}

export function buildPrompt(d: DayData, now: Date): string {
  const identifiers = (d.linear?.completed ?? []).map((i) => i.identifier)
  const prLabels = [
    ...(d.github?.merged ?? []),
    ...(d.github?.opened ?? []),
  ].map((p) => prLabel(p.repo, p.number))
  const repos = [...new Set([...(d.github?.merged ?? []), ...(d.github?.opened ?? [])].map((p) => shortRepo(p.repo)))]

  return `You are writing an end-of-day summary for the person whose day this was.

**It is ${time(now)} on ${d.date}.** The day below runs from midnight up to right now and no further.
Nothing later today has happened yet, so never write about it as though it has.

First gather two more things yourself, then write the summary. Do not ask questions.

1. **Meetings.** Use your Google Calendar connector for today's events on the primary calendar.
   Skip anything you declined, all-day entries, and blocks marked free.
   **A meeting counts as attended only if it has already ENDED by ${time(now)}.** Anything starting
   later today is upcoming, not attended — count those separately and never say you were in one.
2. **Slack.** Use your Slack connector for messages you sent today. Keep only the ones that decided
   something, unblocked someone, or raised a problem. Ignore chatter and pleasantries.

Then reply with ONLY this JSON:

{
  "headline": "one sentence, under 90 characters, on what the day amounted to so far",
  "issues": [
    {
      "identifier": "exactly one of: ${identifiers.join(", ") || "(none closed today)"}",
      "prs": ["the pull requests that did this work, from the list below"],
      "note": "one sentence on what actually changed, in plain language"
    }
  ],
  "repos": [
    { "repo": "one of: ${repos.join(", ") || "(none)"}", "note": "one sentence on what the day did to this repo" }
  ],
  "communication": ["one sentence each, at most 4, only what decided or unblocked something"],
  "meetings": {
    "attended": 0,
    "minutes": 0,
    "upcoming": 0,
    "note": "one short sentence naming them, or \\"\\" if there were none"
  },
  "other": ["one sentence for any pull request that belongs to no closed issue, at most 3"]
}

Rules that matter:

- Use identifiers and pull request labels **exactly** as written below. Never invent one.
- Do not repeat the issue title in "note" — it is already known. Say what the change does.
- Every pull request should appear once: against an issue if it belongs to one, otherwise in "other".
- Available pull requests: ${prLabels.join(", ") || "(none)"}
- No praise, no filler, no "great job". Plain statements of what happened.
- Leave a list empty rather than padding it.

Here is the day:

${facts(d)}`
}
