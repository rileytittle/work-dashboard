import { mkdir, readdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/** Your own background files live here; the folder is git-ignored. */
const DIR = path.join(process.cwd(), "public", "backgrounds")

const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"])
const VIDEO = new Set([".mp4", ".webm", ".mov"])
const MAX_BYTES = 250 * 1024 * 1024

export type BackgroundFile = {
  name: string
  /** Served straight out of /public */
  url: string
  kind: "image" | "video"
}

function kindOf(name: string): "image" | "video" | null {
  const ext = path.extname(name).toLowerCase()
  return IMAGE.has(ext) ? "image" : VIDEO.has(ext) ? "video" : null
}

/** Strips directories and anything that isn't a plain file name, so uploads can't escape the folder. */
function safeName(raw: string): string | null {
  const base = path.basename(raw).replace(/[^\w.\- ]+/g, "_").trim()
  if (!base || base.startsWith(".") || base.includes("..")) return null
  return base
}

/** "photo.jpg" becomes "photo-1.jpg" when something is already called that. */
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  const ext = path.extname(base)
  const stem = base.slice(0, -ext.length || undefined)
  for (let n = 1; ; n++) {
    const next = `${stem}-${n}${ext}`
    if (!taken.has(next)) return next
  }
}

async function list(): Promise<BackgroundFile[]> {
  const names = await readdir(DIR).catch(() => [])
  return names
    .map((name) => ({ name, url: `/backgrounds/${encodeURIComponent(name)}`, kind: kindOf(name) }))
    .filter((f): f is BackgroundFile => f.kind !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function GET() {
  return NextResponse.json({ files: await list() })
}

/** Saves an uploaded image or video into public/backgrounds. */
export async function POST(req: Request) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Expected a file upload" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "No file in the upload" }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `That file is over ${MAX_BYTES / 1024 / 1024}MB` }, { status: 413 })
  }

  const name = safeName(file.name)
  if (!name || !kindOf(name)) {
    return NextResponse.json({ error: "Only images (jpg, png, webp, avif, gif) and videos (mp4, webm, mov)" }, { status: 415 })
  }

  await mkdir(DIR, { recursive: true })
  const taken = new Set((await readdir(DIR).catch(() => [])) as string[])
  const final = uniqueName(name, taken)
  await writeFile(path.join(DIR, final), Buffer.from(await file.arrayBuffer()))

  return NextResponse.json({
    file: { name: final, url: `/backgrounds/${encodeURIComponent(final)}`, kind: kindOf(final) },
    files: await list(),
  })
}

/** Deletes one of your saved backgrounds. */
export async function DELETE(req: Request) {
  const raw = new URL(req.url).searchParams.get("name") ?? ""
  const name = safeName(raw)
  if (!name || !kindOf(name)) return NextResponse.json({ error: "Not a background file" }, { status: 400 })

  try {
    await unlink(path.join(DIR, name))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 })
    }
  }
  return NextResponse.json({ files: await list() })
}
