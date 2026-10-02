# Dashboard

A personal command center that runs on your own machine. Your Linear issues, the pull requests
waiting on your review, your running Claude Code agents and your Spotify player — sitting quietly
over a background you choose.

Built with Next.js 16, React 19, Tailwind CSS 4 and daisyUI 5.

---

## What you need

Every integration uses **your own** accounts. Each panel works on its own, so skip anything you
don't use and switch that panel off in **Settings**.

| For | You need | Required? |
| --- | --- | --- |
| Everything | **Node.js 20.9+** and npm | Yes |
| Issues panel | A **Linear** account and a personal API key | For that panel |
| Reviews panel | A **GitHub** account — git already signed in on this machine, or a token | For that panel |
| Agents panel | **Claude Code** installed and used on this machine | Optional |
| Spotify player | **Spotify Premium** and your own (free) Spotify developer app | For that panel |
| Daily report | **Claude Code** on this machine, with its Calendar and Slack connectors | For that panel |

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Create `.env.local`

Copy `.env.example` to `.env.local` and fill in what you use. The file is git-ignored, so your keys
stay on this machine.

```bash
cp .env.example .env.local
```

### 3. Run

```bash
npm run dev
```

Open **<http://127.0.0.1:3000>**. Use `127.0.0.1`, not `localhost`, or the Spotify login will fail.
Restart the server after you change `.env.local` — Next only reads it at startup.

That's the development server. To leave the dashboard running all the time instead, see
**Running it all the time** below.

---

## Your background

This is the part you set yourself. Open **Settings** (the sliders button, top right) → **Background**:

- **Colour** — six presets (three flat, three gradients) or any colour you pick.
- **Your files** — upload an image or a video, or **drop one anywhere on the page**. They are saved
  in `public/backgrounds/`, which is git-ignored, and you can copy files there by hand too. Hover a
  thumbnail to delete it.
- **Link** — paste the URL of any image or video.

Images and videos also get **Fit** (fill the screen or show the whole thing) and **Blur**. Under
**Appearance** there is **Dim**, which lays black over the background so panel text stays readable
on a busy photo, and **Accent**, the one colour the whole interface highlights with.

Videos play muted and loop. Everything you choose is remembered in this browser.

---

## Connecting each service

### Linear (Issues panel)

1. In Linear: **Settings → Security & access → Personal API keys**, create a key.
2. Put it in `LINEAR_API_KEY`.

The panel shows every issue assigned to you in your team's **active cycle** that isn't canceled,
grouped by status, with priority, labels and SLA countdowns. Issues assigned to you sitting in
triage are under **In triage** at the bottom. The footer totals your open and finished points. If
your team doesn't use cycles, the panel will be empty.

### GitHub (Reviews panel)

Every open pull request where your review is requested, grouped by repository.

- **Easiest:** leave `GITHUB_TOKEN` blank. If you have ever pushed or pulled from github.com over
  HTTPS on this machine, the app asks git for that saved login (`git credential fill`, which reads
  the macOS keychain or Windows Credential Manager).
- **Or** create a token at <https://github.com/settings/tokens> — classic with the `repo` scope, or
  fine-grained with **Pull requests: Read** — and put it in `GITHUB_TOKEN`.
- If your organization uses SSO, click **Configure SSO → Authorize** next to the token, or that
  org's PRs won't appear.

### Claude Code (Agents panel)

Nothing to configure. The panel reads Claude Code's own session files in `~/.claude/sessions` and
shows each running session: a spinner while it works, a check when it's done, with its project,
branch and last prompt. Sessions that just finished flash green for a few seconds.

When a session's branch matches a Linear issue — Linear's suggested branch name, or any branch
carrying the identifier, like `fix/eng-123-retry` — that issue gets a small agent chip, so you can
see at a glance which of your issues something is being done to.

The **Claude usage** row at the bottom shows the same plan limits as Claude Code's `/usage` (5-hour
session, weekly, per-model weekly) with reset times. The server reads Claude Code's login from the
macOS keychain or `~/.claude/.credentials.json`, asks `api.anthropic.com` once a minute, and never
sends the token to the browser. That login is short-lived and Claude Code refreshes it whenever it
runs, so if you haven't used Claude Code for a while this says usage is unavailable until you do.

### Spotify (player)

Every person needs their **own** Spotify developer app — someone else's Client ID will not work for
you, because apps in development mode only allow users their owner has added. It takes two minutes:

1. Go to <https://developer.spotify.com/dashboard> and click **Create app**.
2. Set the **Redirect URI** to exactly `http://127.0.0.1:3000/callback`.
3. Under APIs used, tick **Web API** and **Web Playback SDK**.
4. Copy the app's **Client ID** into `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` and restart `npm run dev`.
5. Click **Connect Spotify** in the top right and approve.

Notes:

- **Spotify Premium** is required for playback control and for **Play here** (streaming in the tab).
- Only the Client ID is used — the app signs in with PKCE, so there is no client secret to store.
- If the in-tab player runs out of songs it restarts your last playlist on shuffle.

---

## Running it all the time

It's installed as a macOS **LaunchAgent**, so the built dashboard starts at login and comes back on
its own if it ever dies. Nothing to start by hand.

| Piece | Where |
| --- | --- |
| Service definition | `~/Library/LaunchAgents/com.coletittle.work-dashboard.plist` |
| What it runs | `bin/serve` in this project, which finds node itself |
| Log | `~/Library/Logs/work-dashboard.log` |
| Control command | `~/.local/bin/dash` |
| Dock app | `~/Applications/Dashboard.app` |

### The `dash` command

```bash
dash             # open the dashboard, filling the screen
dash update      # rebuild after you change code, then restart
dash status      # is it up?
dash log         # last 60 lines of the log
dash follow      # tail the log
dash report      # run today's report now
dash stop        # stop it until next login
dash start       # start it again
```

**After changing any code, run `dash update`.** The service runs the *built* version, so edits don't
show up until it's rebuilt. If you'd rather have instant reloads while working on it, run
`dash stop` and use `npm run dev` as usual, then `dash start` when you're done.

`bin/serve` looks for node on the PATH, then in nvm (the version nvm calls default, else the newest
installed), then in Homebrew — so upgrading node won't break the service. It also puts
`~/.local/bin`, `/opt/homebrew/bin` and `/usr/local/bin` back on the PATH, because launchd starts
the service with almost none and the daily report shells out to `claude`, which lives in
`~/.local/bin`.

### Notifications

When the report finishes on its own at 4:40, macOS shows a banner with the headline. Pressing
**Run again** yourself stays quiet, since you are already looking at it. A run that fails sends a
banner too, so a broken report never passes silently.

Out of the box this uses `osascript`, so the banner appears but clicking it does nothing, and macOS
attributes it to **Script Editor** — that's the name to look for in **System Settings →
Notifications** if no banner shows up. Installing `terminal-notifier` makes the banner clickable
(it opens the dashboard) and gives it its own entry:

```bash
brew install terminal-notifier
```

Nothing else to change — the server picks it up automatically. `dash notify-test` fires a sample.

### Installing it as its own app

The dashboard ships a web manifest, so Chrome can install it as a desktop application: open it,
then **⋮ → Cast, save and share → Install page as app**. You get a real app with its own icon, its
own window and **its own process — so quitting Chrome no longer closes your dashboard**, which is
the one thing the plain window below can't do. It still uses Chrome's engine, so Spotify's in-tab
playback keeps working.

Once it's installed, `dash` opens that app instead of a plain window, and you can delete
`Dashboard.app`.

### The Dock icon

`~/Applications/Dashboard.app` opens the dashboard in a Chrome window of its own. Drag it to the
Dock to keep it there. It starts the service first if it somehow isn't running.

If you'd prefer a true standalone app window, Chrome can make one: open the dashboard, then
**⋮ → Cast, save and share → Install page as app**. That gives its own Dock icon and window, and you
can delete `Dashboard.app`.

### Removing it

```bash
launchctl bootout gui/$(id -u)/com.coletittle.work-dashboard
rm ~/Library/LaunchAgents/com.coletittle.work-dashboard.plist
rm ~/.local/bin/dash
rm -rf ~/Applications/Dashboard.app
```

---

## The daily report

At **4:40 PM** the dashboard collects your day and has Claude write it up: the pull requests you
opened, merged and reviewed, the Linear issues you closed and their story points, the meetings you
actually attended, and the Slack messages you sent. The dashboard fetches the pull requests and
issues itself, because those numbers have to be exact; Claude gathers the meetings and Slack
messages through its own connectors in the same run. Until then it's a pill under the header with a
countdown and a **Run now** button; afterwards the pill carries the headline and expands into a card
you can collapse again. The card floats over the dashboard, so nothing below it moves.

There is no background scheduler. The first time the dashboard asks for the report after it's due,
the server runs it, saves it to `.reports/<date>.json` (git-ignored) and serves that copy to every
tab for the rest of the day. Open the dashboard at 7 PM and it runs then. **Run now** forces a fresh
one at any hour and replaces the day's saved copy. Change the time with `REPORT_AT` in `.env.local`.

The writing is done by the **Claude Code CLI on this machine** — `claude -p` — so it uses your
existing Claude plan rather than API credits. Each run costs roughly 10–15 cents of plan usage and
takes well under a minute. It runs with `--no-session-persistence`, so report runs never show up in
the Agents panel.

**Settings → Daily report** lists every source with a tick or a cross, so you can see what it can read.

### Meetings and Slack

Nothing to set up. Claude reads them itself through the **Google Calendar** and **Slack connectors
already attached to your Claude account** — the same ones you use in Claude Code — so the dashboard
never needs a Google OAuth app, a Slack app, or a token of its own. Check them with `claude mcp list`;
Settings → Daily report shows whether each one is up.

The run is allowed to reach only those two connectors. Writing files, running commands and browsing
the web are denied outright.

---

## Using it

- **Settings** (top right) — background, accent, clock colour, dim, which panels are on screen, and
  what the daily report can read. The clock colour applies to the counts underneath it too, and the
  clock and those counts switch on and off separately.
- **Daily report** (under the header) — click the pill to expand it, the chevron to collapse it.
- **Now playing** (top right) — click it for the full player: play/pause, skip, shuffle, device
  switching, what's up next, and your playlists. **Play here** streams in this tab.
- **Hide** (bottom right, or `H`) — hides everything so you can just look at your background.
- The centre clock shows a live count of what is open, waiting on your review, and being worked on.

### Keyboard

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Previous / next track |
| `H` | Hide / show the interface |
| `Esc` | Close Settings |

---

## Making it yours

- `src/app/globals.css` holds the look: the frosted `.surface` card, the accent variable, and the
  small type styles. Change them there and everything follows.
- `NEXT_PUBLIC_DASHBOARD_TITLE` in `.env.local` sets the wordmark and the browser tab title.
- Panels live in `src/components/*-panel.tsx`, and each one is a thin client component over an API
  route in `src/app/api/`. To add your own, write a route, write a panel, and add it to
  `PANELS` in `src/lib/settings.ts` and to the grid in `src/components/dashboard.tsx`.
- The report's wording lives in `src/lib/report/prompt.ts` — change the instructions there to change
  what it pays attention to. A new source is a file in `src/lib/report/sources/` plus a line in
  `collectDay` and in the digest.

---

## Privacy

This app has **no login** and is meant to run on your own machine. Its API routes hand your Linear
issues, GitHub reviews and Claude Code session details to anyone who can reach the server, so don't
deploy it publicly as it stands. Your keys live only in `.env.local`, your finished reports in `.reports/` and your background files in `public/backgrounds/` —
all of which git ignores.

The Agents panel, the Claude usage row and the daily report all read things that only exist on the
machine running the server, so they only work locally.
