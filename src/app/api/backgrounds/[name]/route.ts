import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Serves a background out of public/backgrounds.
 *
 * It can't be left to Next's static handling: `next start` only serves what was
 * in public/ at build time, so anything uploaded afterwards 404s. Reading the
 * folder here means uploads work straight away, and so do files copied in by
 * hand, with no rebuild.
 */
const DIR = path.join(process.cwd(), "public", "backgrounds")

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
}

const missing = () => new Response("Not found", { status: 404 })

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const raw = decodeURIComponent((await params).name)
  // basename strips any attempt to climb out of the folder
  const name = path.basename(raw)
  if (!name || name.startsWith(".")) return missing()

  const type = TYPES[path.extname(name).toLowerCase()]
  if (!type) return missing()

  const file = path.join(DIR, name)
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) return missing()

  const headers: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    // names are made unique on upload, so a file never changes under a given url
    "cache-control": "public, max-age=31536000, immutable",
  }

  // video elements ask for ranges; answering 206 is what makes them play and seek
  const range = req.headers.get("range")
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (match) {
    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1
    if (!Number.isFinite(start) || start > end || start >= info.size) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "content-range": `bytes */${info.size}` },
      })
    }
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
    return new Response(stream, {
      status: 206,
      headers: {
        ...headers,
        "content-range": `bytes ${start}-${end}/${info.size}`,
        "content-length": String(end - start + 1),
      },
    })
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream
  return new Response(stream, { headers: { ...headers, "content-length": String(info.size) } })
}
