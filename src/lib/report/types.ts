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

export type PrRef = { label: string; url: string; merged: boolean }

/** An issue you finished, with the pull requests that closed it. */
export type ReportIssue = {
  identifier: string
  title: string
  url: string
  points: number | null
  prs: PrRef[]
  /** One line from Claude on what actually changed */
  note: string
}

export type ReportRepo = {
  repo: string
  prs: PrRef[]
  /** One line from Claude on what the day did to this repo */
  note: string
}

export type ReportMeetings = {
  attended: number
  minutes: number
  /** Still to come later today — not counted as attended */
  upcoming: number
  note: string
}

export type Report = {
  /** Bumped when the shape changes, so older saved reports are regenerated */
  version: 2
  date: string
  generatedAt: string
  /** The clock time the report covers up to */
  coversUntil: string
  headline: string
  issues: ReportIssue[]
  repos: ReportRepo[]
  /** Slack worth remembering: decisions, unblocking, problems raised */
  communication: string[]
  meetings: ReportMeetings
  /** Pull requests that belong to no closed issue */
  other: string[]
  totals: {
    prsOpened: number
    prsMerged: number
    prsReviewed: number
    issuesClosed: number
    points: number
    repos: number
    meetings: number
    meetingMinutes: number
  }
  errors: SourceError[]
}

export type ReportStatus =
  | { status: "off"; reason: string }
  | { status: "pending"; dueAt: string; date: string }
  | { status: "running"; date: string }
  | { status: "ready"; date: string; report: Report; running: boolean; error?: string }
  | { status: "error"; date: string; message: string }
