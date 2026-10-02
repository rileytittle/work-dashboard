/** The local day the report covers, and when it is due. */

/** "16:40" in .env.local, 4:40 PM by default. */
export function reportTime(): { hour: number; minute: number } {
  const raw = process.env.REPORT_AT?.trim() || "16:40"
  const [h, m] = raw.split(":").map(Number)
  if (Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h < 24 && m >= 0 && m < 60) {
    return { hour: h, minute: m }
  }
  return { hour: 16, minute: 40 }
}

export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** Midnight this morning through right now, in the server's own timezone. */
export function dayWindow(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return { date: localDate(now), from: start, to: now }
}

export function dueAt(now = new Date()): Date {
  const { hour, minute } = reportTime()
  const due = new Date(now)
  due.setHours(hour, minute, 0, 0)
  return due
}

export const isDue = (now = new Date()) => now >= dueAt(now)
