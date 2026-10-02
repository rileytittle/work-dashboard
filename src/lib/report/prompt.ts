import type { DayData } from "./types"

/** Turns the day's raw data into something worth reading, and cheap to send. */
function digest(d: DayData): string {
  const lines: string[] = []

  if (d.github) {
    const { opened, merged, reviewed } = d.github
    lines.push("## Pull requests")
    if (!opened.length && !merged.length && !reviewed.length) lines.push("(none today)")
    for (const p of opened) lines.push(`- opened ${p.repo}#${p.number}: ${p.title}`)
    for (const p of merged) lines.push(`- MERGED ${p.repo}#${p.number}: ${p.title}`)
    for (const p of reviewed) lines.push(`- reviewed ${p.repo}#${p.number} by ${p.author}: ${p.title}`)
  }

  if (d.linear) {
    lines.push("", "## Linear issues closed")
    if (!d.linear.completed.length) lines.push("(none today)")
    for (const i of d.linear.completed) {
      const pts = i.estimate ? ` [${i.estimate} pts]` : ""
      const proj = i.project ? ` (${i.project})` : ""
      lines.push(`- ${i.identifier}${pts}${proj}: ${i.title}`)
    }
    lines.push(`Total story points closed: ${d.linear.points}`)
  }

  if (d.errors.length) {
    lines.push("", "## Sources that failed (say nothing about these)")
    for (const e of d.errors) lines.push(`- ${e.source}: ${e.message}`)
  }

  return lines.join("\n")
}

export function buildPrompt(d: DayData): string {
  return `You are writing a short end-of-day summary for the person whose day this was. Today is ${d.date}.

First gather two more things for yourself, then write the summary. Do not ask questions.

1. **Meetings.** Use your Google Calendar connector to list today's events on the primary calendar.
   Skip anything you declined, all-day entries, and blocks marked free — those aren't meetings you sat in.
2. **Slack.** Use your Slack connector to find the messages you sent today. Keep only the ones that
   decided something, unblocked someone or raised a problem. Ignore chatter and pleasantries.

If either connector isn't available or returns nothing, carry on without it and say nothing about it.
The pull request and issue data below is already gathered — don't go looking for more of it.

Write in second person ("you shipped", "you spent"). Be concrete and specific: name the issues, the
pull requests and the meetings that mattered, and use the real numbers. No filler, no praise, no
"great job". If a section has nothing in it, leave the section out rather than saying "nothing
happened". Group related work together instead of listing everything one by one — the point is what
the day added up to, not a transcript. For Slack, pick out only the messages that decided something,
unblocked someone or raised a problem; ignore chatter.

Reply with this JSON and nothing else:

{
  "headline": "one sentence, under 90 characters, saying what the day amounted to",
  "sections": [
    { "title": "Short section name", "bullets": ["one sentence each, 2-5 of them"] }
  ],
  "stats": [
    { "label": "short label", "value": "short value" }
  ],
  "counts": {
    "meetings": 0,
    "meetingMinutes": 0,
    "slackMessages": 0
  }
}

"counts" is what you found yourself: how many meetings you attended, how many minutes they took in
total, and how many messages you sent in Slack today. Use 0 for anything you couldn't read.

Use 2 to 4 sections. Good section names are things like "Shipped", "In review", "Meetings",
"Worth following up". Put 3 to 5 stats in, the ones that actually say something about the day.

Here is the day:

${digest(d)}`
}
