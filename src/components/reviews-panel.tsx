"use client"

import type { RepoReviews } from "@/app/api/github/route"
import { timeAgo } from "@/lib/time"
import { usePoll } from "@/lib/use-poll"
import { Panel, PanelLoading, PanelMessage, PanelMeta } from "./panel"

const CODE = "rounded bg-white/10 px-1 font-mono text-[11px] text-white/60"

/** Open pull requests waiting on your review, grouped by repository. */
export function ReviewsPanel() {
  const { data, error, loading } = usePoll<{ repos: RepoReviews[]; total: number }>("/api/github", 90_000)
  const repos = data?.repos ?? []

  return (
    <Panel
      title="Reviews"
      listClassName="max-h-[calc(55vh-7rem)]"
      meta={data && <PanelMeta main={`${data.total} waiting`} sub={`${repos.length} ${repos.length === 1 ? "repo" : "repos"}`} />}
    >
      {loading && !data ? (
        <PanelLoading />
      ) : error && !data ? (
        <PanelMessage>
          {/GITHUB_TOKEN|No GitHub token|GitHub API 401/.test(error) ? (
            <>
              No GitHub token yet. Run <code className={CODE}>git fetch</code> in any GitHub repo to sign in, or set{" "}
              <code className={CODE}>GITHUB_TOKEN</code> in <code className={CODE}>.env.local</code>.
            </>
          ) : (
            error
          )}
        </PanelMessage>
      ) : !repos.length ? (
        <PanelMessage>No reviews waiting on you.</PanelMessage>
      ) : (
        repos.map(({ repo, pulls }) => {
          const [org, name] = repo.split("/")
          return (
            <div key={repo} className="mb-1.5">
              <a
                href={`https://github.com/${repo}/pulls/review-requested/@me`}
                target="_blank"
                rel="noreferrer"
                className="label-xs flex items-center justify-between gap-2 px-2 py-1.5 transition hover:text-white/70"
              >
                <span className="truncate">
                  <span className="text-white/25">{org}/</span>
                  {name}
                </span>
                <span className="shrink-0 rounded-full border border-accent/40 bg-accent/15 px-1.5 font-mono tracking-normal text-white/80">
                  {pulls.length}
                </span>
              </a>
              {pulls.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="row group flex gap-2.5">
                  {p.authorAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.authorAvatar}
                      alt=""
                      className="mt-0.5 h-5 w-5 shrink-0 rounded-full ring-1 ring-white/15"
                    />
                  ) : (
                    <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-white/10" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[13px] text-white/85 group-hover:text-white">
                      {p.draft && (
                        <span className="mr-1 rounded bg-white/15 px-1 text-[10px] uppercase tracking-wide text-white/50">
                          draft
                        </span>
                      )}
                      {p.title}
                    </div>
                    <div className="truncate text-[11px] text-white/35">
                      #{p.number} · {p.author} · {timeAgo(p.createdAt)} old
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )
        })
      )}
    </Panel>
  )
}
