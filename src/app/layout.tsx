import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] })

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_DASHBOARD_TITLE ?? "Dashboard",
  description: "Linear issues, GitHub reviews, Claude Code agents and Spotify over your own background",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  applicationName: process.env.NEXT_PUBLIC_DASHBOARD_TITLE ?? "Dashboard",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  )
}
