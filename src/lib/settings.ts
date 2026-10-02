"use client"

import { useCallback, useSyncExternalStore } from "react"

const KEY = "dashboard.settings"

export const PANELS = [
  { id: "report", label: "Daily report" },
  { id: "issues", label: "Issues (Linear)" },
  { id: "reviews", label: "Reviews (GitHub)" },
  { id: "agents", label: "Agents (Claude Code)" },
  { id: "spotify", label: "Spotify player" },
  { id: "clock", label: "Clock" },
  { id: "counts", label: "Counts under the clock" },
] as const

export type PanelId = (typeof PANELS)[number]["id"]

export type BackgroundKind = "color" | "image" | "video"

export type Background = {
  kind: BackgroundKind
  /** A hex colour for "color", otherwise a URL or /backgrounds/<file> path */
  src: string
  /** How an image or video fills the screen */
  fit: "cover" | "contain"
  /** Percent of black laid over the background, 0-90 */
  dim: number
  /** Blur in pixels, 0-40 */
  blur: number
}

export type Settings = {
  background: Background
  /** Hex accent used for highlights throughout the UI */
  accent: string
  /** Which panels are on screen */
  panels: Record<PanelId, boolean>
  /** Colour of the big clock: "default" (white), "accent", or a hex colour */
  clockColor: string
  /** Whether the daily report is expanded into its card */
  reportOpen: boolean
  /** Show seconds on the big clock */
  seconds: boolean
  /** Whether the whole interface is visible (off = just the background) */
  chrome: boolean
}

export const DEFAULTS: Settings = Object.freeze<Settings>({
  background: { kind: "color", src: "#0b0d10", fit: "cover", dim: 30, blur: 0 },
  accent: "#7aa2f7",
  panels: { report: true, issues: true, reviews: true, agents: true, spotify: true, clock: true, counts: true },
  clockColor: "default",
  reportOpen: true,
  seconds: false,
  chrome: true,
})

function merge(saved: unknown): Settings {
  if (!saved || typeof saved !== "object") return DEFAULTS
  const s = saved as Partial<Settings>
  return {
    ...DEFAULTS,
    ...s,
    background: { ...DEFAULTS.background, ...s.background },
    panels: { ...DEFAULTS.panels, ...s.panels },
  }
}

let state: Settings | null = null
const listeners = new Set<() => void>()

function read(): Settings {
  if (state) return state
  if (typeof window === "undefined") return DEFAULTS
  try {
    state = merge(JSON.parse(localStorage.getItem(KEY) ?? "null"))
  } catch {
    state = DEFAULTS
  }
  return state
}

function write(next: Settings) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // private browsing, quota — the UI still works for this session
  }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  // another tab changed them
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    state = null
    fn()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener("storage", onStorage)
  }
}

/** The whole settings object, plus setters. Safe to call from any client component. */
export function useSettings() {
  const settings = useSyncExternalStore(subscribe, read, () => DEFAULTS)

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    write({ ...read(), [key]: value })
  }, [])

  const setBackground = useCallback((patch: Partial<Background>) => {
    const current = read()
    write({ ...current, background: { ...current.background, ...patch } })
  }, [])

  const togglePanel = useCallback((id: PanelId) => {
    const current = read()
    write({ ...current, panels: { ...current.panels, [id]: !current.panels[id] } })
  }, [])

  const reset = useCallback(() => write(DEFAULTS), [])

  return { settings, set, setBackground, togglePanel, reset }
}
