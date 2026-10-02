/** Everything the daily report is built from, and the report itself. */

export type DayPullRequest = {
  repo: string
  number: number
  title: string
  url: string
  author: string | null
  createdAt: string
  mergedAt: string | null
}

export type DayIssue = {
  identifier: string
  title: string
  url: string
  estimate: number | null
  completedAt: string
  state: string
  project: string | null
}

export type SourceError = { source: string; message: string }

export type DayData = {
  /** Local calendar day, YYYY-MM-DD */
  date: string
  from: string
  to: string
  github: { opened: DayPullRequest[]; merged: DayPullRequest[]; reviewed: DayPullRequest[] } | null
  linear: { completed: DayIssue[]; points: number } | null
  errors: SourceError[]
}

export type ReportSection = { title: string; bullets: string[] }

export type Report = {
  date: string
  generatedAt: string
  headline: string
  sections: ReportSection[]
  stats: { label: string; value: string }[]
  /**
   * Counts kept alongside the prose. The GitHub and Linear numbers are counted
   * here; the meeting and Slack numbers come back from Claude, which read them
   * through its own connectors.
   */
  totals: {
    prsOpened: number
    prsMerged: number
    prsReviewed: number
    issuesClosed: number
    points: number
    meetings: number
    meetingMinutes: number
    slackMessages: number
  }
  errors: SourceError[]
}

export type ReportStatus =
  | { status: "off"; reason: string }
  | { status: "pending"; dueAt: string; date: string }
  | { status: "running"; date: string }
  | { status: "ready"; date: string; report: Report; running: boolean; error?: string }
  | { status: "error"; date: string; message: string }
