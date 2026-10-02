"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { handleCallback } from "@/lib/spotify"

/** Where Spotify sends you back after you approve the app. */
export default function SpotifyCallback() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    const exchange = code
      ? handleCallback(code)
      : Promise.reject(new Error(params.get("error") ?? "Missing authorization code"))
    exchange.then(() => window.location.replace("/")).catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#05070a] text-white">
      {error ? (
        <div className="space-y-4 text-center">
          <p className="text-red-300">Spotify login failed: {error}</p>
          <Link
            href="/"
            className="inline-block rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/70 transition hover:text-white"
          >
            Back to the dashboard
          </Link>
        </div>
      ) : (
        <span className="spinner h-8 w-8 border-2" />
      )}
    </main>
  )
}
