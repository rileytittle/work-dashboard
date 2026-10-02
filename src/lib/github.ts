import { execFile } from "node:child_process"

const GITHUB_API = "https://api.github.com"

let keychainToken: Promise<string | null> | null = null

/**
 * Falls back to the github.com credential git already has (macOS keychain,
 * Windows Credential Manager), so no token has to live in .env.local.
 */
function tokenFromKeychain(): Promise<string | null> {
  keychainToken ??= new Promise((resolve) => {
    const child = execFile(
      "git",
      ["credential", "fill"],
      { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 5000 },
      (err, stdout) => resolve(err ? null : (stdout.match(/^password=(.+)$/m)?.[1]?.trim() ?? null)),
    )
    child.stdin?.end("protocol=https\nhost=github.com\n\n")
  })
  return keychainToken
}

async function getToken(): Promise<string> {
  const token = process.env.GITHUB_TOKEN?.trim() || (await tokenFromKeychain())
  if (!token) throw new Error("No GitHub token — set GITHUB_TOKEN or sign in to github.com with git")
  return token
}

export async function githubGet<T>(path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      authorization: `Bearer ${await getToken()}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
    cache: "no-store",
  })
  if (!res.ok) {
    if (res.status === 401) keychainToken = null // re-read after you re-auth git
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}
