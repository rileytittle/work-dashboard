"use client"

import { useEffect, useRef, useState } from "react"
import clsx from "clsx"
import { Check, Link2, RotateCcw, SlidersHorizontal, Trash2, Upload, X } from "lucide-react"
import type { SourceState } from "@/app/api/sources/route"
import { ACCEPT, removeBackground, uploadBackground, useBackgrounds } from "@/lib/backgrounds"
import { usePoll } from "@/lib/use-poll"
import { DEFAULTS, PANELS, useSettings, type BackgroundKind } from "@/lib/settings"
import { Dots } from "./panel"

const ACCENTS = ["#7aa2f7", "#7dcfff", "#9ece6a", "#e0af68", "#ff9e64", "#f7768e", "#bb9af7", "#c0caf5"]

/** Clock colours. "default" is the page's own white, "accent" follows the accent swatch. */
const CLOCK_COLORS: { value: string; swatch: string; title: string }[] = [
  { value: "default", swatch: "#ffffff", title: "White" },
  { value: "accent", swatch: "var(--accent)", title: "Match the accent" },
  { value: "#f5e6c8", swatch: "#f5e6c8", title: "Cream" },
  { value: "#e0af68", swatch: "#e0af68", title: "Amber" },
  { value: "#f7768e", swatch: "#f7768e", title: "Rose" },
  { value: "#9ece6a", swatch: "#9ece6a", title: "Green" },
  { value: "#7dcfff", swatch: "#7dcfff", title: "Sky" },
  { value: "#bb9af7", swatch: "#bb9af7", title: "Violet" },
]

const FILLS: { label: string; value: string }[] = [
  { label: "Ink", value: "#0b0d10" },
  { label: "Slate", value: "#111519" },
  { label: "Warm", value: "#12100e" },
  { label: "Dusk", value: "linear-gradient(160deg, #141a2b 0%, #0a0c12 60%)" },
  { label: "Moss", value: "linear-gradient(160deg, #101a16 0%, #080b0a 60%)" },
  { label: "Plum", value: "linear-gradient(160deg, #1b1426 0%, #0a080e 60%)" },
]

const VIDEO_EXT = /\.(mp4|webm|mov)(\?|#|$)/i

type Tab = "fill" | "library" | "url"

export function SettingsDrawer() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Settings"
        aria-label="Settings"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/60 backdrop-blur transition hover:border-accent/50 hover:text-white"
      >
        <SlidersHorizontal size={15} />
      </button>
      {open && <Drawer onClose={() => setOpen(false)} />}
    </>
  )
}

function Drawer({ onClose }: { onClose: () => void }) {
  const { settings, set, setBackground, togglePanel, reset } = useSettings()
  const bg = settings.background
  const [tab, setTab] = useState<Tab>(bg.kind === "color" ? "fill" : "library")
  // a hex the presets don't cover means they picked their own
  const isCustomClock = !CLOCK_COLORS.some((c) => c.value === settings.clockColor)

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="surface-strong animate-slide-in fixed inset-y-0 right-0 z-[60] flex w-[min(24rem,100vw)] flex-col rounded-none border-y-0 border-r-0 border-l border-white/10">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="label-xs">Settings</h2>
          <button onClick={onClose} aria-label="Close settings" className="text-white/40 transition hover:text-white">
            <X size={16} />
          </button>
        </header>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <Section title="Background">
            <div className="mb-4 flex gap-1 rounded-full border border-white/10 bg-black/30 p-1">
              {(
                [
                  ["fill", "Colour"],
                  ["library", "Your files"],
                  ["url", "Link"],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={clsx(
                    "flex-1 rounded-full py-1 text-xs transition",
                    tab === id ? "bg-accent/20 text-white" : "text-white/40 hover:text-white/70",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "fill" && <FillTab />}
            {tab === "library" && <LibraryTab />}
            {tab === "url" && <UrlTab />}
          </Section>

          {bg.kind !== "color" && (
            <Section title="Fit">
              <div className="mb-4 flex gap-1 rounded-full border border-white/10 bg-black/30 p-1">
                {(["cover", "contain"] as const).map((fit) => (
                  <button
                    key={fit}
                    onClick={() => setBackground({ fit })}
                    className={clsx(
                      "flex-1 rounded-full py-1 text-xs capitalize transition",
                      bg.fit === fit ? "bg-accent/20 text-white" : "text-white/40 hover:text-white/70",
                    )}
                  >
                    {fit === "cover" ? "Fill screen" : "Show all"}
                  </button>
                ))}
              </div>
              <Slider label="Blur" value={bg.blur} max={40} unit="px" onChange={(blur) => setBackground({ blur })} />
            </Section>
          )}

          <Section title="Appearance">
            <div className="mb-4">
              <div className="mb-2 text-[11px] uppercase tracking-[0.1em] text-white/35">Accent</div>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    onClick={() => set("accent", c)}
                    aria-label={`Accent ${c}`}
                    style={{ background: c }}
                    className={clsx(
                      "h-7 w-7 rounded-full border border-white/15 transition hover:scale-110",
                      settings.accent === c && "ring-2 ring-white/70 ring-offset-2 ring-offset-[#0b0d11]",
                    )}
                  />
                ))}
                <label
                  title="Pick any colour"
                  className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-white/15"
                  style={{ background: "conic-gradient(#f7768e,#e0af68,#9ece6a,#7dcfff,#bb9af7,#f7768e)" }}
                >
                  <input
                    type="color"
                    value={settings.accent}
                    onChange={(e) => set("accent", e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
              </div>
            </div>
            <Slider
              label="Dim"
              value={bg.dim}
              max={90}
              unit="%"
              onChange={(dim) => setBackground({ dim })}
            />
          </Section>

          <Section title="Show">
            {PANELS.map(({ id, label }) => (
              <label
                key={id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-[13px] text-white/70 transition hover:bg-white/5 hover:text-white"
              >
                {label}
                <input
                  type="checkbox"
                  className="toggle toggle-sm border-white/20 checked:border-accent checked:bg-accent"
                  checked={settings.panels[id]}
                  onChange={() => togglePanel(id)}
                />
              </label>
            ))}
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-[13px] text-white/70 transition hover:bg-white/5 hover:text-white">
              Seconds on the clock
              <input
                type="checkbox"
                className="toggle toggle-sm border-white/20 checked:border-accent checked:bg-accent"
                checked={settings.seconds}
                onChange={() => set("seconds", !settings.seconds)}
              />
            </label>
          </Section>

          {(settings.panels.clock || settings.panels.counts) && (
            <Section title="Clock">
              <div className="mb-4 flex gap-1 rounded-full border border-white/10 bg-black/30 p-1">
                {(
                  [
                    ["center", "Middle"],
                    ["corner", "Top left"],
                  ] as ["center" | "corner", string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => set("clockPosition", id)}
                    className={clsx(
                      "flex-1 rounded-full py-1 text-xs transition",
                      settings.clockPosition === id ? "bg-accent/20 text-white" : "text-white/40 hover:text-white/70",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mb-4">
                <div className="mb-2 text-[11px] uppercase tracking-[0.1em] text-white/35">Colour</div>
                <div className="flex flex-wrap items-center gap-2">
                  {CLOCK_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => set("clockColor", c.value)}
                      aria-label={c.title}
                      title={c.title}
                      style={{ background: c.swatch }}
                      className={clsx(
                        "h-7 w-7 rounded-full border border-white/15 transition hover:scale-110",
                        settings.clockColor === c.value && "ring-2 ring-white/70 ring-offset-2 ring-offset-[#0b0d11]",
                      )}
                    />
                  ))}
                  <label
                    title="Pick any colour"
                    className={clsx(
                      "relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-white/15 transition hover:scale-110",
                      isCustomClock && "ring-2 ring-white/70 ring-offset-2 ring-offset-[#0b0d11]",
                    )}
                    style={{
                      background: isCustomClock
                        ? settings.clockColor
                        : "conic-gradient(#f7768e,#e0af68,#9ece6a,#7dcfff,#bb9af7,#f7768e)",
                    }}
                  >
                    <input
                      type="color"
                      value={isCustomClock ? settings.clockColor : "#ffffff"}
                      onChange={(e) => set("clockColor", e.target.value)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-[13px] text-white/70 transition hover:bg-white/5 hover:text-white">
                Frosted panel behind it
                <input
                  type="checkbox"
                  className="toggle toggle-sm border-white/20 checked:border-accent checked:bg-accent"
                  checked={settings.clockSurface}
                  onChange={() => set("clockSurface", !settings.clockSurface)}
                />
              </label>
              {settings.clockSurface && (
                <div className="mt-3">
                  <Slider
                    label="Panel opacity"
                    value={settings.clockSurfaceOpacity}
                    max={100}
                    unit="%"
                    onChange={(v) => set("clockSurfaceOpacity", v)}
                  />
                </div>
              )}
            </Section>
          )}

          <Section title="Links">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-[13px] text-white/70 transition hover:bg-white/5 hover:text-white">
              Open Linear in the desktop app
              <input
                type="checkbox"
                className="toggle toggle-sm border-white/20 checked:border-accent checked:bg-accent"
                checked={settings.linearInApp}
                onChange={() => set("linearInApp", !settings.linearInApp)}
              />
            </label>
            <p className="px-2 pt-1 text-[11px] leading-relaxed text-white/30">
              Off sends issues to your browser instead. Chrome asks once whether to allow Linear to
              open — tick its box to stop being asked.
            </p>
          </Section>

          <Section title="Daily report">
            <Connections />
          </Section>

          <Section title="Keyboard">
            {[
              ["Play / pause", "Space"],
              ["Previous / next track", "← →"],
              ["Hide the interface", "H"],
              ["Close this drawer", "Esc"],
            ].map(([what, key]) => (
              <div key={what} className="flex items-center justify-between gap-3 py-1 text-xs text-white/40">
                {what}
                <kbd className="rounded border border-white/15 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white/60">
                  {key}
                </kbd>
              </div>
            ))}
          </Section>

          <button
            onClick={reset}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-2 text-xs text-white/40 transition hover:border-white/25 hover:text-white/80"
          >
            <RotateCcw size={13} /> Reset to defaults
          </button>
        </div>
      </aside>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h3 className="label-xs mb-3">{title}</h3>
      {children}
    </section>
  )
}

function Slider({
  label,
  value,
  max,
  unit,
  onChange,
}: {
  label: string
  value: number
  max: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between text-[11px] uppercase tracking-[0.1em] text-white/35">
        {label}
        <span className="font-mono normal-case tracking-normal text-white/55">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range range-xs [--range-bg:rgba(255,255,255,0.14)] [--range-fill:0] [--range-thumb:var(--accent)]"
      />
    </label>
  )
}

function FillTab() {
  const { settings, setBackground } = useSettings()
  const bg = settings.background
  const isHex = bg.kind === "color" && bg.src.startsWith("#")

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {FILLS.map((f) => (
          <button
            key={f.label}
            onClick={() => setBackground({ kind: "color", src: f.value })}
            title={f.label}
            style={{ background: f.value }}
            className={clsx(
              "h-14 rounded-xl border transition",
              bg.kind === "color" && bg.src === f.value
                ? "border-accent ring-1 ring-accent"
                : "border-white/10 hover:border-white/30",
            )}
          />
        ))}
      </div>
      <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2 text-[13px] text-white/60 transition hover:border-white/25 hover:text-white">
        Custom colour
        <span
          className="relative h-6 w-10 overflow-hidden rounded-md border border-white/15"
          style={{ background: isHex ? bg.src : "#0b0d10" }}
        >
          <input
            type="color"
            value={isHex ? bg.src : "#0b0d10"}
            onChange={(e) => setBackground({ kind: "color", src: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </span>
      </label>
    </>
  )
}

function LibraryTab() {
  const { settings, setBackground } = useSettings()
  const { files, loading, uploading, error } = useBackgrounds()
  const input = useRef<HTMLInputElement>(null)
  const bg = settings.background

  const pick = async (file: File | undefined) => {
    if (!file) return
    const saved = await uploadBackground(file)
    if (saved) setBackground({ kind: saved.kind, src: saved.url })
  }

  const drop = async (name: string, url: string) => {
    await removeBackground(name)
    if (bg.src === url) setBackground(DEFAULTS.background)
  }

  return (
    <>
      <button
        onClick={() => input.current?.click()}
        disabled={uploading}
        className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-white/20 px-4 py-5 text-xs text-white/40 transition hover:border-accent/50 hover:bg-accent/5 hover:text-white/70 disabled:opacity-50"
      >
        {uploading ? <span className="spinner h-4 w-4 border-2" /> : <Upload size={17} />}
        {uploading ? "Saving…" : "Upload an image or video"}
        <span className="text-[10px] text-white/25">or drop one anywhere on the page</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ""
        }}
      />

      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}

      {loading ? (
        <p className="mt-3 text-center text-[11px] text-white/30">
          <Dots />
        </p>
      ) : files.length === 0 ? (
        <p className="mt-3 text-[11px] leading-relaxed text-white/30">
          Nothing saved yet. Files you add live in <code className="text-white/50">public/backgrounds</code>, so you
          can also copy them there by hand.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {files.map((f) => (
            <div
              key={f.name}
              className={clsx(
                "group relative aspect-[16/10] cursor-pointer overflow-hidden rounded-xl border bg-black/40 transition",
                bg.src === f.url ? "border-accent ring-1 ring-accent" : "border-white/10 hover:border-white/30",
              )}
              onClick={() => setBackground({ kind: f.kind, src: f.url })}
              title={f.name}
            >
              {f.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <video src={f.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              )}
              {f.kind === "video" && (
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9px] uppercase tracking-wide text-white/60">
                  video
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  drop(f.name, f.url)
                }}
                aria-label={`Delete ${f.name}`}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white/50 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function UrlTab() {
  const { setBackground } = useSettings()
  const [url, setUrl] = useState("")
  const [kind, setKind] = useState<Exclude<BackgroundKind, "color"> | "auto">("auto")

  const apply = () => {
    const trimmed = url.trim()
    if (!trimmed) return
    const resolved = kind === "auto" ? (VIDEO_EXT.test(trimmed) ? "video" : "image") : kind
    setBackground({ kind: resolved, src: trimmed })
  }

  return (
    <>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="https://…"
          className="input input-sm min-w-0 flex-1 rounded-xl border-white/15 bg-black/30 text-[13px] focus:border-accent focus:outline-none"
        />
        <button
          onClick={apply}
          className="flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/15 px-3 text-xs text-white transition hover:bg-accent/25"
        >
          <Link2 size={13} /> Use
        </button>
      </div>
      <div className="mt-2 flex gap-1 rounded-full border border-white/10 bg-black/30 p-1">
        {(["auto", "image", "video"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={clsx(
              "flex-1 rounded-full py-1 text-xs capitalize transition",
              kind === k ? "bg-accent/20 text-white" : "text-white/40 hover:text-white/70",
            )}
          >
            {k}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-white/30">
        Any image or video URL works. It is loaded straight from that address, so it needs to stay reachable.
      </p>
    </>
  )
}

/** What the daily report can read, and what still needs connecting. */
function Connections() {
  const { data } = usePoll<{ sources: SourceState[] }>("/api/sources", 60_000)
  if (!data) return <Dots />

  return (
    <div className="space-y-1">
      {data.sources.map((s) => (
        <div key={s.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px]">
          <span
            className={clsx(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
              s.configured ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-400" : "border-white/20",
            )}
          >
            {s.configured && <Check size={10} />}
          </span>
          <span className={clsx("flex-1 truncate", s.configured ? "text-white/80" : "text-white/40")}>
            {s.label}
            {!s.configured && s.note && (
              <span className="block truncate text-[10px] text-white/25">needs {s.note}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
