"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import clsx from "clsx"
import { ListMusic, LogOut, MonitorSpeaker, Music2, Pause, Play, Search, Shuffle, SkipBack, SkipForward } from "lucide-react"
import {
  activateWebPlayer,
  hasSpotifyClient,
  isLoggedIn,
  login,
  logout,
  reconnectWebPlayer,
  spotify,
  SpotifyError,
  startWebPlayer,
  subscribeAuth,
  WEB_PLAYER_NAME,
  type Device,
  type PlaybackState,
  type Playlist,
  type SdkState,
  type Track,
} from "@/lib/spotify"
import { clock } from "@/lib/time"

const POLL_MS = 3000
const LAST_CONTEXT_KEY = "spotify.lastContext"

const rememberContext = (uri: string | null | undefined) => {
  if (uri) localStorage.setItem(LAST_CONTEXT_KEY, uri)
}

const art = (t: Track | null | undefined, small = false) => {
  const imgs = t?.album.images ?? []
  return (small ? imgs[imgs.length - 1] : imgs[0])?.url ?? null
}

const artists = (t: Track | null | undefined) => t?.artists.map((a) => a.name).join(", ") ?? ""

export function SpotifyPlayer() {
  // null while hydrating, then whether a token is stored
  const connected = useSyncExternalStore(subscribeAuth, isLoggedIn, () => null)
  const [playback, setPlayback] = useState<PlaybackState | null>(null)
  const [fetchedAt, setFetchedAt] = useState(0)
  const [now, setNow] = useState(0)
  const [open, setOpen] = useState(false)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [queue, setQueue] = useState<Track[]>([])
  const [filter, setFilter] = useState("")
  const [localDevice, setLocalDevice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sdkState, setSdkState] = useState<SdkState | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)

  // Polling bookkeeping: skip overlapping polls, tolerate a few failures before complaining
  const inFlight = useRef(false)
  const pollFailures = useRef(0)
  const lastDeviceId = useRef<string | null>(null)
  const localDeviceRef = useRef<string | null>(null)
  useEffect(() => {
    localDeviceRef.current = localDevice
  }, [localDevice])

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const state = await spotify<PlaybackState>("/me/player?additional_types=track")
      // /me/player sometimes omits the item; currently-playing usually has it
      if (state && !state.item) {
        const cp = await spotify<{ item: Track | null }>(
          "/me/player/currently-playing?additional_types=track",
        ).catch(() => null)
        if (cp?.item) state.item = cp.item
      }
      setPlayback(state)
      pollFailures.current = 0
      lastDeviceId.current = state?.device.id ?? null
      rememberContext(state?.context?.uri)
      setError((e) => (e?.startsWith("Spotify isn't responding") ? null : e))
      setFetchedAt(Date.now())
    } catch (err) {
      if (err instanceof SpotifyError && err.status === 401) return // the auth store logs us out
      const failures = ++pollFailures.current
      if (failures === 3) setError("Spotify isn't responding right now — still retrying…")
      // Timeouts that won't clear usually mean Spotify is stuck on this tab's old player: reconnect it
      if (failures === 4 && lastDeviceId.current && lastDeviceId.current === localDeviceRef.current) {
        const id = await reconnectWebPlayer()
        if (id) {
          await spotify("/me/player", {
            method: "PUT",
            body: JSON.stringify({ device_ids: [id], play: true }),
          }).catch(() => null)
        }
      }
    } finally {
      inFlight.current = false
    }
  }, [])

  /**
   * The in-browser player has no autoplay: when it runs out of songs it just
   * stops and Spotify drops the device. Restart the last playlist on shuffle
   * (or a random one of yours) so the music keeps going.
   */
  const keepPlaying = useCallback(async () => {
    const device = localDeviceRef.current
    if (!device) return
    try {
      let uri = localStorage.getItem(LAST_CONTEXT_KEY)
      if (!uri) {
        const mine = (await spotify<{ items: Playlist[] }>("/me/playlists?limit=50"))?.items.filter(Boolean) ?? []
        uri = mine[Math.floor(Math.random() * mine.length)]?.uri ?? null
      }
      if (!uri) return
      await spotify(`/me/player/play?device_id=${device}`, {
        method: "PUT",
        body: JSON.stringify({ context_uri: uri }),
      })
      await spotify(`/me/player/shuffle?state=true&device_id=${device}`, { method: "PUT" }).catch(() => null)
      setTimeout(refresh, 800)
    } catch (err) {
      setError(`Couldn't keep the music going: ${(err as Error).message}`)
    }
  }, [refresh])

  // The SDK callback is registered once, so route it through a ref to see current state
  const prevSdk = useRef<SdkState | null>(null)
  const onSdkState = useRef<(st: SdkState | null) => void>(() => {})
  useEffect(() => {
    onSdkState.current = (st) => {
      const prev = prevSdk.current
      prevSdk.current = st
      setSdkState(st)
      rememberContext(st?.context?.uri)
      // playing, then paused at 0:00 with nothing queued = the player ran out of music
      const ranOut =
        !!prev && !prev.paused && !!st && st.paused && st.position === 0 && !st.track_window.next_tracks.length
      if (ranOut) keepPlaying()
    }
  })

  // Boot: start the in-browser player and poll playback
  useEffect(() => {
    if (!connected) return
    startWebPlayer(setLocalDevice, setError, (st) => onSdkState.current(st))
    const poll = () => document.visibilityState === "visible" && refresh()
    const first = setTimeout(poll, 0)
    const id = setInterval(poll, POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 500)
    return () => {
      clearTimeout(first)
      clearInterval(id)
      clearInterval(tick)
    }
  }, [connected, refresh])

  const loadExtras = useCallback(async () => {
    const [pl, dev, q] = await Promise.allSettled([
      spotify<{ items: Playlist[] }>("/me/playlists?limit=50"),
      spotify<{ devices: Device[] }>("/me/player/devices"),
      spotify<{ queue: Track[] }>("/me/player/queue"),
    ])
    if (pl.status === "fulfilled") setPlaylists(pl.value?.items.filter(Boolean) ?? [])
    if (dev.status === "fulfilled") setDevices(dev.value?.devices ?? [])
    if (q.status === "fulfilled") setQueue(q.value?.queue.slice(0, 4) ?? [])
  }, [])

  // Close when you click away
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onDown)
    return () => window.removeEventListener("mousedown", onDown)
  }, [open])

  // Prefer the Web API's view; fall back to what the in-tab player reports
  const track: Track | null = playback?.item ?? sdkState?.track_window.current_track ?? null
  const playing = playback ? playback.is_playing : !!sdkState && !sdkState.paused

  /**
   * Nothing is playing anywhere, so Spotify has no device to send commands to.
   * Wake one up: this tab's player if Spotify still sees it, else whatever is
   * active, else reconnect this tab's player, else any open Spotify app.
   */
  const activateSomeDevice = useCallback(async (): Promise<boolean> => {
    const list = (await spotify<{ devices: Device[] }>("/me/player/devices"))?.devices ?? []
    const usable = list.filter((d) => d.id && !d.is_restricted)
    let target = usable.find((d) => d.id === localDevice)?.id ?? usable.find((d) => d.is_active)?.id ?? null
    if (!target) target = await reconnectWebPlayer()
    if (!target) target = usable[0]?.id ?? null
    if (!target) return false
    await activateWebPlayer()
    const transfer = () =>
      spotify("/me/player", { method: "PUT", body: JSON.stringify({ device_ids: [target], play: false }) })
    try {
      await transfer()
    } catch {
      await new Promise((r) => setTimeout(r, 1500)) // a just-reconnected player takes a moment to register
      await transfer()
    }
    await new Promise((r) => setTimeout(r, 700)) // give Spotify a moment to switch
    return true
  }, [localDevice])

  /** Runs a player command; if no device is active, activates one and tries again. */
  const command = useCallback(
    async (path: string, method: string, body?: unknown) => {
      setError(null)
      const send = () => spotify(path, { method, body: body ? JSON.stringify(body) : undefined })
      try {
        try {
          await send()
        } catch (err) {
          if (!(err instanceof SpotifyError && err.status === 404)) throw err
          if (!(await activateSomeDevice())) {
            throw new Error(
              localDevice
                ? "Couldn't reach a Spotify device. Try again in a moment."
                : "No Spotify device available — open Spotify on your computer or phone, or refresh this page so its player can connect.",
            )
          }
          await send()
        }
      } catch (err) {
        setError(
          err instanceof SpotifyError && err.status === 403
            ? "That needs Spotify Premium"
            : err instanceof SpotifyError && err.status >= 500
              ? "Spotify timed out on that one — give it a second and try again."
              : err instanceof SpotifyError && err.status === 404
                ? "Spotify still has no active device — press play in any Spotify app once, then try again."
                : (err as Error).message,
        )
      }
      setTimeout(refresh, 350)
      if (open) setTimeout(loadExtras, 800)
    },
    [activateSomeDevice, localDevice, refresh, loadExtras, open],
  )

  const togglePlay = useCallback(() => {
    command(playing ? "/me/player/pause" : "/me/player/play", "PUT")
  }, [playing, command])

  const next = useCallback(() => command("/me/player/next", "POST"), [command])
  const prev = useCallback(() => command("/me/player/previous", "POST"), [command])

  const playHere = async () => {
    if (!localDevice) return
    await activateWebPlayer()
    await command("/me/player", "PUT", { device_ids: [localDevice], play: true })
  }

  // Keyboard: space = play/pause, arrows = previous/next
  useEffect(() => {
    if (!connected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.code === "Space") {
        e.preventDefault()
        togglePlay()
      } else if (e.key === "ArrowRight") next()
      else if (e.key === "ArrowLeft") prev()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [connected, togglePlay, next, prev])

  const shown = useMemo(
    () => playlists.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase())),
    [playlists, filter],
  )

  if (connected === null) return null

  if (!hasSpotifyClient() || !connected) {
    return (
      <button
        onClick={() => hasSpotifyClient() && login()}
        title={hasSpotifyClient() ? "Connect Spotify" : "Set NEXT_PUBLIC_SPOTIFY_CLIENT_ID in .env.local"}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3.5 py-2 text-[13px] text-white/70 backdrop-blur transition hover:border-[#1DB954]/60 hover:text-white"
      >
        <Music2 size={15} className="text-[#1DB954]" />
        {hasSpotifyClient() ? "Connect Spotify" : "Spotify not set up"}
      </button>
    )
  }

  const baseProgress = playback?.item ? (playback.progress_ms ?? 0) : (sdkState?.position ?? 0)
  const progress = track
    ? Math.min(track.duration_ms, baseProgress + (playing && playback ? Math.max(0, now - fetchedAt) : 0))
    : 0
  const pct = track ? (progress / track.duration_ms) * 100 : 0
  const onThisTab = !!localDevice && playback?.device.id === localDevice
  const cover = art(track)

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => {
          if (!open) loadExtras()
          setOpen(!open)
        }}
        className={clsx(
          "flex max-w-[20rem] items-center gap-2.5 rounded-full border bg-black/40 py-1.5 pl-1.5 pr-4 text-left backdrop-blur transition",
          playing ? "border-accent/50" : "border-white/15 hover:border-white/30",
        )}
      >
        {art(track, true) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art(track, true)!}
            alt=""
            className={clsx("h-8 w-8 shrink-0 rounded-full object-cover", playing && "animate-spin-slow")}
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/40">
            <Music2 size={14} />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-white">{track?.name ?? "Nothing playing"}</span>
          <span className="block truncate text-[11px] text-white/40">{track ? artists(track) : "Pick a playlist"}</span>
        </span>
        <span className="flex h-3.5 shrink-0 items-end gap-[2px]">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={clsx("w-[2px] rounded-sm bg-accent", playing ? "h-full eq-bar" : "h-[3px]")}
              style={playing ? { animationDelay: `${i * 0.15}s` } : undefined}
            />
          ))}
        </span>
      </button>

      {open && (
        <div className="surface-strong animate-fade-in absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[22rem] overflow-hidden">
          <div className="relative overflow-hidden p-4">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="absolute inset-0 h-full w-full scale-150 object-cover opacity-25 blur-3xl" />
            )}
            <div className="relative flex gap-3.5">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="h-[4.75rem] w-[4.75rem] shrink-0 rounded-xl object-cover shadow-2xl" />
              ) : (
                <div className="flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/40">
                  <Music2 size={22} />
                </div>
              )}
              <div className="min-w-0 self-end">
                <div className="truncate text-[17px] font-medium leading-tight">{track?.name ?? "Nothing playing"}</div>
                <div className="truncate text-xs text-white/55">{artists(track)}</div>
                <div className="truncate text-[11px] text-white/30">{track?.album.name}</div>
              </div>
            </div>

            <div className="relative mt-3.5">
              <div className="h-[3px] overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-white/35">
                <span>{clock(progress)}</span>
                <span>{clock(track?.duration_ms ?? 0)}</span>
              </div>
            </div>

            <div className="relative mt-3 flex items-center justify-center gap-1.5">
              <button
                onClick={() => command(`/me/player/shuffle?state=${!playback?.shuffle_state}`, "PUT")}
                title="Shuffle"
                className={clsx(
                  "flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/10",
                  playback?.shuffle_state ? "text-accent" : "text-white/50",
                )}
              >
                <Shuffle size={15} />
              </button>
              <button
                onClick={prev}
                title="Previous (←)"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <SkipBack size={17} />
              </button>
              <button
                onClick={togglePlay}
                title="Play / pause (Space)"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-black/85 shadow-[0_6px_22px_-8px_var(--accent)] transition hover:brightness-110"
              >
                {playing ? <Pause size={18} /> : <Play size={18} className="translate-x-[1px]" />}
              </button>
              <button
                onClick={next}
                title="Next (→)"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <SkipForward size={17} />
              </button>
              {localDevice && !onThisTab && (
                <button
                  onClick={playHere}
                  title="Stream in this tab"
                  className="ml-1 rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-[11px] text-white transition hover:bg-accent/25"
                >
                  Play here
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2 text-xs text-white/45">
            <MonitorSpeaker size={13} className="shrink-0" />
            <select
              className="min-w-0 flex-1 cursor-pointer truncate bg-transparent text-white/70 outline-none"
              value={playback?.device.id ?? ""}
              onChange={(e) => e.target.value && command("/me/player", "PUT", { device_ids: [e.target.value], play: playing })}
            >
              {!playback && <option value="">No active device</option>}
              {devices
                .filter((d) => d.id)
                .map((d) => (
                  <option key={d.id} value={d.id!} className="bg-[#12151a]">
                    {d.id === localDevice ? `This tab (${WEB_PLAYER_NAME})` : d.name}
                  </option>
                ))}
            </select>
          </div>

          {queue.length > 0 && (
            <div className="border-t border-white/10 px-4 py-2">
              <div className="label-xs mb-1">Up next</div>
              {queue.map((t, i) => (
                <div key={`${t.id}-${i}`} className="truncate text-[11px] text-white/60">
                  <span className="text-white/25">{i + 1}.</span> {t.name}{" "}
                  <span className="text-white/35">— {t.artists[0]?.name}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-white/10">
            <label className="flex items-center gap-2 px-4 py-2 text-white/35">
              <ListMusic size={13} className="shrink-0" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Playlists…"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30"
              />
              <Search size={13} className="shrink-0" />
            </label>
            <ul className="thin-scroll max-h-60 overflow-y-auto pb-1.5">
              {shown.map((p) => {
                const active = playback?.context?.uri === p.uri
                const img = p.images?.[p.images.length - 1]?.url
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => command("/me/player/play", "PUT", { context_uri: p.uri })}
                      className={clsx(
                        "flex w-full items-center gap-2.5 px-4 py-1.5 text-left transition hover:bg-white/5",
                        active && "bg-accent/15",
                      )}
                    >
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="h-7 w-7 shrink-0 rounded bg-white/10" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className={clsx("truncate text-xs", active ? "text-accent" : "text-white/85")}>{p.name}</div>
                        <div className="truncate text-[10px] text-white/30">
                          {p.owner.display_name} · {(p.items ?? p.tracks)?.total ?? 0} tracks
                        </div>
                      </div>
                      {active && playing && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
                    </button>
                  </li>
                )
              })}
              {!shown.length && <li className="px-4 py-2 text-[11px] text-white/30">No playlists</li>}
            </ul>
          </div>

          {error && <div className="border-t border-white/10 px-4 py-2 text-[11px] text-red-300">{error}</div>}

          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-1.5 border-t border-white/10 py-2 text-[11px] text-white/30 transition hover:text-white/70"
          >
            <LogOut size={11} /> Disconnect Spotify
          </button>
        </div>
      )}
    </div>
  )
}
