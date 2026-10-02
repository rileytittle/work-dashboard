import { githubGet } from "@/lib/github"
import type { DayData, DayPullRequest } from "../types"

type SearchItem = {
  number: number
  title: string
  html_url: string
  repository_url: string
  created_at: string
  pull_request?: { merged_at: string | null }
  user: { login: string } | null
}

const toPr = (i: SearchItem): DayPullRequest => ({
  repo: i.repository_url.split("/repos/")[1],
  number: i.number,
  title: i.title,
  url: i.html_url,
  author: i.user?.login ?? null,
  createdAt: i.created_at,
  mergedAt: i.pull_request?.merged_at ?? null,
})

async function search(q: string): Promise<DayPullRequest[]> {
  const data = await githubGet<{ items: SearchItem[] }>(
    `/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=50`,
  )
  return data.items.map(toPr)
}

/** What you opened, merged and reviewed between `from` and now. */
export async function collectGithub(from: Date): Promise<NonNullable<DayData["github"]>> {
  // GitHub search takes an ISO8601 stamp with an offset, so "today" means your today
  const since = isoWithOffset(from)
  const [opened, merged, reviewed] = await Promise.all([
    search(`is:pr author:@me created:>=${since}`),
    search(`is:pr author:@me is:merged merged:>=${since}`),
    search(`is:pr reviewed-by:@me -author:@me updated:>=${since}`),
  ])
  return { opened, merged, reviewed }
}

/** "2026-09-30T00:00:00-04:00" — GitHub rejects a bare Z stamp for local-day searches. */
function isoWithOffset(d: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0")
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? "+" : "-"
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(off / 60)}:${pad(off % 60)}`
  )
}
