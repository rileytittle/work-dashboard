/** "now", "12m", "5h", "3d" since `iso`. */
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "now"
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/** "4h left", "3d left" until `iso`. */
export function timeLeft(iso: string): string {
  const s = (new Date(iso).getTime() - Date.now()) / 1000
  if (s <= 0) return "ending"
  if (s < 86400) return `${Math.ceil(s / 3600)}h left`
  return `${Math.ceil(s / 86400)}d left`
}

/** Two units of what's left until `iso`: "42m", "4h 12m", "5d 3h". */
export function timeUntil(iso: string): string {
  const m = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 60_000))
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
}

/** Compact span of a duration in ms: "8m", "5h", "2d". */
export function span(ms: number): string {
  const s = Math.abs(ms) / 1000
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/** "3:07" from milliseconds. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
