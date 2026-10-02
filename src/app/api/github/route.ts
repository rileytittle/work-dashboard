import { NextResponse } from "next/server"
import { githubGet } from "@/lib/github"

export const dynamic = "force-dynamic"

type SearchItem = {
  id: number
  number: number
  title: string
  html_url: string
  repository_url: string
  created_at: string
  updated_at: string
  draft?: boolean
  user: { login: string; avatar_url: string } | null
}

export type ReviewRequest = {
  id: number
  number: number
  title: string
  url: string
  createdAt: string
  updatedAt: string
  draft: boolean
  author: string | null
  authorAvatar: string | null
}

export type RepoReviews = { repo: string; pulls: ReviewRequest[] }

/** Open PRs where my review (or one of my teams') is requested, grouped by repo. */
export async function GET() {
  try {
    const q = encodeURIComponent("is:open is:pr review-requested:@me archived:false")
    const data = await githubGet<{ items: SearchItem[] }>(
      `/search/issues?q=${q}&sort=updated&order=desc&per_page=100`,
    )

    const byRepo = new Map<string, ReviewRequest[]>()
    for (const item of data.items) {
      const repo = item.repository_url.split("/repos/")[1]
      const list = byRepo.get(repo) ?? []
      list.push({
        id: item.id,
        number: item.number,
        title: item.title,
        url: item.html_url,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        draft: !!item.draft,
        author: item.user?.login ?? null,
        authorAvatar: item.user?.avatar_url ?? null,
      })
      byRepo.set(repo, list)
    }

    const repos: RepoReviews[] = [...byRepo].map(([repo, pulls]) => ({ repo, pulls }))
    return NextResponse.json({ repos, total: data.items.length })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
