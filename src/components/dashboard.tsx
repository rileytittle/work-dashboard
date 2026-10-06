"use client"

import { useEffect } from "react"
import clsx from "clsx"
import { Eye, EyeOff } from "lucide-react"
import { useSettings } from "@/lib/settings"
import { AgentsPanel } from "./agents-panel"
import { Clock } from "./clock"
import { IssuesPanel } from "./issues-panel"
import { ReportPill } from "./report-pill"
import { ReviewsPanel } from "./reviews-panel"
import { SettingsDrawer } from "./settings-drawer"
import { SpotifyPlayer } from "./spotify-player"

const TITLE = process.env.NEXT_PUBLIC_DASHBOARD_TITLE ?? "Dashboard"

/** The whole interface. Press H to hide it and just look at your background. */
export function Dashboard() {
  const { settings, set } = useSettings()
  const { panels, chrome } = settings

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === "h") set("chrome", !chrome)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [chrome, set])

  const right = panels.reviews || panels.agents
  const showClock = panels.clock || panels.counts
  const inCorner = settings.clockPosition === "corner"

  return (
    <>
      <div
        className={clsx(
          "relative z-10 flex min-h-screen flex-col transition-opacity duration-500",
          !chrome && "pointer-events-none opacity-0",
        )}
        aria-hidden={!chrome}
      >
        <header className="flex items-start justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="h-6 w-6 shrink-0 rounded-lg bg-accent"
                style={{ boxShadow: "0 0 18px -4px var(--accent)" }}
              />
              <span className="truncate text-[13px] font-semibold uppercase tracking-[0.16em] text-white/50">
                {TITLE}
              </span>
            </div>
            {showClock && inCorner && (
              <div className="mt-3.5">
                <Clock variant="corner" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {panels.spotify && <SpotifyPlayer />}
            <SettingsDrawer />
          </div>
        </header>

        {panels.report && (
          <div className="relative z-30 px-6">
            <ReportPill />
          </div>
        )}

        <div className="grid flex-1 items-start gap-5 px-6 pb-6 pt-4 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)_minmax(0,21rem)]">
          {panels.issues ? (
            <div className="order-2 min-w-0 lg:order-1">
              <IssuesPanel />
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}

          <div className="order-1 flex min-w-0 items-center justify-center lg:order-2 lg:min-h-[50vh] lg:self-center">
            {showClock && !inCorner && <Clock />}
          </div>

          {right ? (
            <div className="order-3 flex min-w-0 flex-col gap-5">
              {panels.reviews && <ReviewsPanel />}
              {panels.agents && <AgentsPanel />}
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>
      </div>

      <button
        onClick={() => set("chrome", !chrome)}
        title={chrome ? "Hide the interface (H)" : "Show the interface (H)"}
        className={clsx(
          "fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] text-white/50 backdrop-blur transition hover:border-accent/50 hover:text-white",
          !chrome && "opacity-30 hover:opacity-100",
        )}
      >
        {chrome ? <EyeOff size={13} /> : <Eye size={13} />}
        {chrome ? "Hide" : "Show"}
      </button>
    </>
  )
}
