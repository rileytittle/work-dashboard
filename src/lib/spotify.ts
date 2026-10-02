/**
 * Browser-only Spotify client using Authorization Code + PKCE, so there is no
 * client secret. Tokens live in localStorage and refresh themselves.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? ""
const TOKEN_KEY = "spotify.token"
const VERIFIER_KEY = "spotify.verifier"
const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
  "playlist-read-collaborative",
  "streaming",
  "user-read-email",
  "user-read-private",
].join(" ")

type Token = { access: string; refresh: string; expiresAt: number }

export const hasSpotifyClient = () => !!CLIENT_ID
const redirectUri = () => `${window.location.origin}/callback`

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function login() {
  // Spotify only accepts loopback IPs for http redirect URIs, not "localhost"
  if (window.location.hostname === "localhost") {
    window.location.href = window.location.href.replace("localhost", "127.0.0.1")
    return
  }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)))
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))))
  localStorage.setItem(VERIFIER_KEY, verifier)
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES,
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

// Tiny store so components can follow login state with useSyncExternalStore
const authListeners = new Set<() => void>()
const emitAuth = () => authListeners.forEach((fn) => fn())

export function subscribeAuth(fn: () => void) {
  authListeners.add(fn)
  window.addEventListener("storage", fn)
  return () => {
    authListeners.delete(fn)
    window.removeEventListener("storage", fn)
  }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  emitAuth()
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  })
  if (!res.ok) throw new Error(`Spotify token ${res.status}: ${await res.text()}`)
  const json = await res.json()
  const prev = readToken()
  const token: Token = {
    access: json.access_token,
    refresh: json.refresh_token ?? prev?.refresh ?? "",
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
  emitAuth()
  return token
}

export async function handleCallback(code: string) {
  const verifier = localStorage.getItem(VERIFIER_KEY) ?? ""
  localStorage.removeItem(VERIFIER_KEY)
  await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  })
}

function readToken(): Token | null {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null")
  } catch {
    return null
  }
}

export const isLoggedIn = () => !!readToken()

let refreshing: Promise<Token> | null = null

export async function getAccessToken(): Promise<string | null> {
  const token = readToken()
  if (!token) return null
  if (Date.now() < token.expiresAt - 60_000) return token.access
  refreshing ??= tokenRequest({ grant_type: "refresh_token", refresh_token: token.refresh }).finally(() => {
    refreshing = null
  })
  try {
    return (await refreshing).access
  } catch {
    logout()
    return null
  }
}

export class SpotifyError extends Error {
  constructor(public status: number, public reason: string, message: string) {
    super(message)
  }
}

/** Calls the Web API; returns null for empty responses. */
export async function spotify<T = unknown>(path: string, init: RequestInit = {}): Promise<T | null> {
  const token = await getAccessToken()
  if (!token) throw new SpotifyError(401, "NO_TOKEN", "Not connected to Spotify")
  const isRead = !init.method || init.method === "GET"
  const attempt = () =>
    fetch(`https://api.spotify.com/v1${path}`, {
      ...init,
      // Spotify's player endpoints occasionally hang; don't let reads pile up
      signal: isRead ? AbortSignal.timeout(8000) : undefined,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
    })
  let res = await attempt()
  // 5xx ("upstream request timeout" etc.) is usually a blip on Spotify's side — retry reads
  for (const wait of [400, 1200]) {
    if (!isRead || res.status < 500) break
    await new Promise((r) => setTimeout(r, wait))
    res = await attempt()
  }
  if (res.status === 204 || res.status === 202) return null
  const text = await res.text()
  if (!res.ok) {
    let reason = ""
    let message = text
    try {
      const err = JSON.parse(text).error
      reason = err?.reason ?? ""
      message = err?.message ?? text
    } catch {}
    if (res.status === 401) logout()
    throw new SpotifyError(res.status, reason, message)
  }
  // Player commands sometimes answer 200 with a bare ID string instead of JSON
  try {
    return text ? (JSON.parse(text) as T) : null
  } catch {
    return null
  }
}

// --- Web API shapes we use ---------------------------------------------------

export type SpotifyImage = { url: string; width: number | null; height: number | null }

export type Track = {
  id: string
  name: string
  uri: string
  duration_ms: number
  artists: { name: string }[]
  album: { name: string; images: SpotifyImage[] }
}

export type PlaybackState = {
  is_playing: boolean
  progress_ms: number | null
  shuffle_state: boolean
  device: { id: string | null; name: string; type: string; volume_percent: number | null }
  item: Track | null
  context: { uri: string } | null
}

export type Playlist = {
  id: string
  name: string
  uri: string
  images: SpotifyImage[] | null
  owner: { display_name: string }
  // Spotify renamed `tracks` to `items` in 2026; accept either
  items?: { total: number }
  tracks?: { total: number }
}

export type Device = { id: string | null; name: string; type: string; is_active: boolean; is_restricted?: boolean }

// --- Web Playback SDK (turns this tab into a Spotify Connect device) ---------

type SdkPlayer = {
  connect(): Promise<boolean>
  disconnect(): void
  activateElement(): Promise<void>
  addListener(ev: "ready" | "not_ready", cb: (d: { device_id: string }) => void): void
  addListener(ev: "player_state_changed", cb: (s: SdkState | null) => void): void
  addListener(ev: string, cb: (d: { message: string }) => void): void
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void
    Spotify?: {
      Player: new (opts: {
        name: string
        getOAuthToken: (cb: (t: string) => void) => void
        volume?: number
      }) => SdkPlayer
    }
  }
}

/** What the in-tab player reports; its current_track has the same shape as a Web API Track. */
export type SdkState = {
  paused: boolean
  position: number
  context: { uri: string | null } | null
  track_window: { current_track: Track | null; next_tracks: Track[] }
}

export const WEB_PLAYER_NAME = "Dashboard"

let sdkPlayer: SdkPlayer | null = null
let readyWaiters: ((id: string | null) => void)[] = []

export function startWebPlayer(
  onReady: (deviceId: string | null) => void,
  onError: (msg: string) => void,
  onState: (s: SdkState | null) => void,
) {
  if (sdkPlayer) return
  const init = () => {
    const player = new window.Spotify!.Player({
      name: WEB_PLAYER_NAME,
      volume: 0.8,
      getOAuthToken: (cb) => {
        getAccessToken().then((t) => t && cb(t))
      },
    })
    player.addListener("ready", ({ device_id }) => {
      onReady(device_id)
      readyWaiters.forEach((fn) => fn(device_id))
      readyWaiters = []
    })
    // fires when the tab's player drops offline (sleep, network); the SDK reconnects and sends "ready" again
    player.addListener("not_ready", () => onReady(null))
    player.addListener("player_state_changed", onState)
    player.addListener("initialization_error", ({ message }) => onError(message))
    player.addListener("authentication_error", ({ message }) => onError(message))
    player.addListener("account_error", () => onError("Playing in the browser needs Spotify Premium"))
    player.connect()
    sdkPlayer = player
  }
  if (window.Spotify) return init()
  window.onSpotifyWebPlaybackSDKReady = init
  const s = document.createElement("script")
  s.src = "https://sdk.scdn.co/spotify-player.js"
  s.async = true
  document.body.appendChild(s)
}

/** Drops and re-opens the tab's player connection; resolves with the new device id (or null after 8s). */
export function reconnectWebPlayer(): Promise<string | null> {
  if (!sdkPlayer) return Promise.resolve(null)
  const ready = new Promise<string | null>((resolve) => {
    readyWaiters.push(resolve)
    setTimeout(() => resolve(null), 8000)
  })
  sdkPlayer.disconnect()
  sdkPlayer.connect()
  return ready
}

/** Browsers block audio until a user gesture; call this from a click. */
export const activateWebPlayer = () => sdkPlayer?.activateElement()
