"use client"

import { useEffect, useState } from "react"
import { ImageUp } from "lucide-react"
import { kindOfFile, uploadBackground, useBackgrounds } from "@/lib/backgrounds"
import { useSettings } from "@/lib/settings"

/**
 * Whatever you chose as a background, full-bleed behind everything, plus the
 * scrim that keeps panel text readable. Dropping an image or video anywhere on
 * the page saves it and switches to it.
 */
export function Background() {
  const { settings, setBackground } = useSettings()
  const { uploading } = useBackgrounds()
  const bg = settings.background
  const [dragging, setDragging] = useState(false)

  // The accent colour and dim level are CSS variables so the whole UI follows them
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--accent", settings.accent)
    root.style.setProperty("--dim", String(bg.dim / 100))
  }, [settings.accent, bg.dim])

  // Drag a file anywhere over the window to set it as the background
  useEffect(() => {
    let depth = 0
    const hasFile = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files")

    const onEnter = (e: DragEvent) => {
      if (!hasFile(e)) return
      depth++
      setDragging(true)
    }
    const onOver = (e: DragEvent) => hasFile(e) && e.preventDefault()
    const onLeave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const onDrop = async (e: DragEvent) => {
      if (!hasFile(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = e.dataTransfer?.files?.[0]
      const kind = file && kindOfFile(file)
      if (!file || !kind) return
      const saved = await uploadBackground(file)
      if (saved) setBackground({ kind: saved.kind, src: saved.url })
    }

    window.addEventListener("dragenter", onEnter)
    window.addEventListener("dragover", onOver)
    window.addEventListener("dragleave", onLeave)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onEnter)
      window.removeEventListener("dragover", onOver)
      window.removeEventListener("dragleave", onLeave)
      window.removeEventListener("drop", onDrop)
    }
  }, [setBackground])

  const media: React.CSSProperties = {
    objectFit: bg.fit,
    // scale a touch so a blurred edge never shows the page behind it
    filter: bg.blur ? `blur(${bg.blur}px)` : undefined,
    transform: bg.blur ? `scale(${1 + bg.blur / 120})` : undefined,
  }

  return (
    <>
      <div
        className="fixed inset-0 z-0 overflow-hidden"
        style={{ background: bg.kind === "color" ? bg.src : "#05070a" }}
        aria-hidden
      >
        {bg.kind === "image" && bg.src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg.src} alt="" className="absolute inset-0 h-full w-full" style={media} />
        )}
        {bg.kind === "video" && bg.src && (
          <video
            key={bg.src}
            src={bg.src}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full"
            style={media}
          />
        )}
        {/* dim, plus a little top-and-bottom shading so the bars stay legible */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgb(0 0 0 / 0.35), transparent 22%, transparent 68%, rgb(0 0 0 / 0.45))," +
              "rgb(0 0 0 / var(--dim))",
          }}
        />
      </div>

      {(dragging || uploading) && (
        <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="surface flex flex-col items-center gap-3 border-dashed border-accent/50 px-14 py-10 text-white/80">
            {uploading ? (
              <>
                <span className="spinner h-6 w-6 border-2" />
                Saving your background…
              </>
            ) : (
              <>
                <ImageUp size={26} className="text-accent" />
                Drop an image or video to set it as your background
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
