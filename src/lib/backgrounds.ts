"use client"

import { useSyncExternalStore } from "react"
import type { BackgroundFile } from "@/app/api/backgrounds/route"

/**
 * Your own background files, kept in public/backgrounds and managed through
 * /api/backgrounds. Shared by the settings drawer and the drag-and-drop layer.
 */

export type { BackgroundFile }

type State = { files: BackgroundFile[]; loading: boolean; uploading: boolean; error: string | null }

let state: State = { files: [], loading: true, uploading: false, error: null }
let started = false
const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

async function call(init?: RequestInit, url = "/api/backgrounds") {
  const res = await fetch(url, { cache: "no-store", ...init })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as { files: BackgroundFile[]; file?: BackgroundFile }
}

export async function loadBackgrounds() {
  try {
    set({ files: (await call()).files, loading: false, error: null })
  } catch (err) {
    set({ loading: false, error: (err as Error).message })
  }
}

/** Saves a dropped or chosen file and returns it, so the caller can switch to it. */
export async function uploadBackground(file: File): Promise<BackgroundFile | null> {
  set({ uploading: true, error: null })
  try {
    const body = new FormData()
    body.append("file", file)
    const { files, file: saved } = await call({ method: "POST", body })
    set({ files, uploading: false })
    return saved ?? null
  } catch (err) {
    set({ uploading: false, error: (err as Error).message })
    return null
  }
}

export async function removeBackground(name: string) {
  try {
    const { files } = await call({ method: "DELETE" }, `/api/backgrounds?name=${encodeURIComponent(name)}`)
    set({ files, error: null })
  } catch (err) {
    set({ error: (err as Error).message })
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  if (!started) {
    started = true
    loadBackgrounds()
  }
  return () => {
    listeners.delete(fn)
  }
}

const SERVER: State = Object.freeze({ files: [], loading: true, uploading: false, error: null })

export function useBackgrounds(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  )
}

/** Images and videos this dashboard can show. */
export const ACCEPT = "image/*,video/mp4,video/webm,video/quicktime"

export const kindOfFile = (f: File): "image" | "video" | null =>
  f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : null
