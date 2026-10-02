"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"

/**
 * Polls a JSON endpoint on a shared timer: however many components ask for the
 * same URL, only one request goes out, and they all see the same answer.
 * The last good payload is kept when a request fails.
 */

export type Poll<T> = { data: T | null; error: string | null; loading: boolean }

type Entry = {
  ms: number
  timer: ReturnType<typeof setInterval> | null
  subs: Set<() => void>
  /** Recreated only when something actually changed, so useSyncExternalStore stays quiet */
  snapshot: Poll<unknown>
  inFlight: boolean
}

const EMPTY: Poll<unknown> = Object.freeze({ data: null, error: null, loading: true })
const entries = new Map<string, Entry>()

function entryFor(url: string, ms: number): Entry {
  let e = entries.get(url)
  if (!e) {
    e = { ms, timer: null, subs: new Set(), snapshot: EMPTY, inFlight: false }
    entries.set(url, e)
  }
  // the shortest interval anyone asked for wins
  e.ms = Math.min(e.ms, ms)
  return e
}

function update(url: string, patch: Partial<Poll<unknown>>) {
  const e = entries.get(url)
  if (!e) return
  e.snapshot = { ...e.snapshot, ...patch }
  e.subs.forEach((fn) => fn())
}

async function load(url: string) {
  const e = entries.get(url)
  if (!e || e.inFlight) return
  e.inFlight = true
  try {
    const res = await fetch(url, { cache: "no-store" })
    const json = await res.json()
    if (!res.ok) update(url, { error: json.error ?? `HTTP ${res.status}`, loading: false })
    else update(url, { data: json, error: null, loading: false })
  } catch (err) {
    update(url, { error: (err as Error).message, loading: false })
  } finally {
    const cur = entries.get(url)
    if (cur) cur.inFlight = false
  }
}

function start(url: string) {
  const e = entries.get(url)
  if (!e || e.timer) return
  load(url)
  e.timer = setInterval(() => {
    // no point polling a tab nobody is looking at
    if (document.visibilityState === "visible") load(url)
  }, e.ms)
}

function subscribe(url: string, ms: number) {
  return (fn: () => void) => {
    const e = entryFor(url, ms)
    e.subs.add(fn)
    start(url)
    return () => {
      e.subs.delete(fn)
      if (e.subs.size) return
      // last listener left: stop the timer but keep the data for the next mount
      if (e.timer) clearInterval(e.timer)
      e.timer = null
    }
  }
}

/** Off state for `usePoll("")` — lets a caller skip an endpoint it doesn't need. */
const OFF: Poll<unknown> = Object.freeze({ data: null, error: null, loading: false })
const noopSubscribe = () => () => {}

/** Pass an empty url to not poll at all (for a panel that is switched off). */
export function usePoll<T>(url: string, ms: number): Poll<T> {
  const sub = useMemo(() => (url ? subscribe(url, ms) : noopSubscribe), [url, ms])
  const get = useCallback(() => (url ? (entryFor(url, ms).snapshot as Poll<T>) : (OFF as Poll<T>)), [url, ms])
  const server = useCallback(() => (url ? (EMPTY as Poll<T>) : (OFF as Poll<T>)), [url])
  return useSyncExternalStore(sub, get, server)
}

/** Re-reads an endpoint now, e.g. right after you changed something. */
export const refreshPoll = (url: string) => load(url)
