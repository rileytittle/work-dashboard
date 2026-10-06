import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { Report } from "./types"

/** Finished reports, one JSON file per day, kept out of git. */
const DIR = path.join(process.cwd(), ".reports")

const file = (date: string) => path.join(DIR, `${date}.json`)

export async function readReport(date: string): Promise<Report | null> {
  try {
    const saved = JSON.parse(await readFile(file(date), "utf8")) as Report
    // an older shape is treated as missing, so it gets written again
    return saved?.version === 2 ? saved : null
  } catch {
    return null
  }
}

export async function writeReport(report: Report) {
  await mkdir(DIR, { recursive: true })
  await writeFile(file(report.date), JSON.stringify(report, null, 2))
}
