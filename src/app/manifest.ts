import type { MetadataRoute } from "next"

/**
 * Lets Chrome install the dashboard as a desktop app of its own — its own icon,
 * its own window, its own process, so closing Chrome doesn't close it.
 * Next serves this at /manifest.webmanifest and links it from every page.
 */
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_DASHBOARD_TITLE ?? "Dashboard"
  return {
    name,
    short_name: name,
    description: "Linear issues, GitHub reviews, Claude Code agents and your day, written up",
    start_url: "/",
    display: "standalone",
    background_color: "#05070a",
    theme_color: "#05070a",
    orientation: "any",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // maskable lets the OS crop it to whatever shape it wants without clipping the art
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
