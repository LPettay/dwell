# dwell

> _**An agent dwells on a website — lingers, watches, pokes, returns — and reports what it's like.**_

Most browser-agent frameworks collapse a dynamic site to a DOM tree plus a screenshot, then ask "did you click the button." That works for tasks. It throws away everything that makes a site feel like itself.

Dwell flips the loop:

1. Drive a real browser (Playwright, headed Chromium).
2. Record the session as a temporal artifact — webm video, interaction log, sampled keyframe screenshots.
3. Reason over the artifact afterward with a vision-capable model.
4. Emit an **impression** — first 5 seconds, after curiosity-driven exploration, after settling — that another human can read and recognize as the site they know.

The goal is not qualia. The goal is: a written impression that holds up against the human experience of the site.

```text
   ╭──────────────╮      ╭───────────────╮      ╭──────────────────╮
   │  dwell <url> │ ───▶ │   recording   │ ───▶ │   impression     │
   │              │      │  (mp4 + log)  │      │  (markdown)      │
   ╰──────────────╯      ╰───────────────╯      ╰──────────────────╯
        drive                 capture                   read
```

---

## Status

**v0.1 — works end-to-end.** Day-zero dogfood was [`https://fireside.technology/`](https://fireside.technology/), a hand-built Three.js meetup site whose character is entirely in motion and cursor response. The impression Dwell produced caught:

- The pixel-flame "blown" away from the cursor
- Rotating monospace green text rings
- The glowing floor grid
- Tooltip text on the bottom icon row
- The settled, hypnotic, screensaver-like quality

Details a single-screenshot pipeline cannot see.

---

## Quick start

> Requires [Bun](https://bun.sh) ≥ 1.1, a Google AI Studio key, `ffmpeg` on PATH (for dense-frame extraction), and a display server (WSLg works on WSL2; native X/Wayland everywhere else).

```bash
bun install
bun playwright install chromium    # if not already cached
ffmpeg -version                     # must be on PATH; install via your package manager if missing
echo "GEMINI_API_KEY=..." > .env

bun run dwell https://fireside.technology/
```

Open the produced markdown at `impressions/<host>-<timestamp>.md`.

### Flags

| Flag | Default | What it does |
|---|---|---|
| `--duration <seconds>` | `30` | How long to dwell. Choreography phases run inside this budget; remaining time is recorded as additional idle. |
| `--viewport <preset\|WxH>` | `desktop` (1280×800) | Browser viewport. Presets: `desktop`, `mobile` (390×844), `tablet` (820×1180). Or pass explicit dimensions like `1920x1080`. |
| `--headless` | off | Debug only. Real impressions require headed Chromium — see [ADR 0004](./docs/decisions/0004-headed-chromium-only.md). |

---

## Output

Two artifacts per run:

1. **Session cache** at `.dwell-cache/<host>-<timestamp>/`
   - `recordings/page@<hash>.webm` — full session, replayable
   - `screenshots/t######-<phase>.png` — keyframes per phase
   - `session.json` — chronological event log (`InteractionEvent[]`)

2. **Impression** at `impressions/<host>-<timestamp>.md`
   - Frontmatter: `url`, `generated_at`, `model`, `dwell_duration_seconds`, `video`
   - Sections: First five seconds / After exploration / Settling
   - One-sentence verdict at the top

Both are gitignored by default. The recording stays so the impression can be regenerated against a different model or prompt without re-driving the browser.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Bun** ≥ 1.1 | One toolchain for install, run, scripts. Direct TypeScript. See [ADR 0001](./docs/decisions/0001-use-bun.md). |
| Language | **TypeScript** strict | Zod-validated at every model boundary. |
| Browser | **Playwright** | Headed Chromium, built-in video recording, mature interaction APIs. |
| Model | **Google `@google/genai`** | Multi-image vision + native structured output. See [ADR 0002](./docs/decisions/0002-gemini-for-vision.md). |
| Deploy | n/a | CLI / library. |

---

## Architecture

See [`docs/architecture.md`](./docs/architecture.md) for the full pipeline. ADRs in [`docs/decisions/`](./docs/decisions/).

The wedge in one sentence: **record-then-reason, not snapshot-then-act.**

---

## Repo layout

```
.
├── AGENTS.md                # repo root — constraints, scope firewall
├── CONTRIBUTING.md          # PR + workflow conventions
├── docs/                    # architecture + ADRs
│   ├── architecture.md
│   └── decisions/           # one short markdown per structural choice
├── scripts/                 # repo-hygiene tooling (check, stamp)
│   └── lib/                 # check helpers
└── src/
    ├── cli/                 # `dwell` CLI entry point
    ├── drive/               # Playwright session driver (the dwelling loop)
    ├── reason/              # Vision-model boundary
    └── types/               # Zod schemas (leaf — depends on nothing)
```

Every directory under `src/`, `docs/`, and `scripts/` has its own `AGENTS.md` with scope-specific guidance. Read it before editing.

---

## Non-goals

This is **not** a general browser-agent framework. It will not:

- Complete tasks on websites (booking, login, form-fill — use [browser-use](https://github.com/browser-use/browser-use) or Playwright directly).
- Scrape structured data (use a scraper).
- Replace accessibility testing or end-to-end test runners.
- Make philosophical claims about machine consciousness.

It does one thing: produce a textual impression of what a website is like to be on.

---

## Known limitations

Dwell's edges, tracked publicly so users know what to expect.

### Best-effort (handled, but not bulletproof)

- **Sparse-event aliasing.** Periodic phenomena with long periods + short visible windows could be misread as one-shot events (e.g., an orbiting element described as "fading"). The current pipeline mitigates this with denser frame sampling from the recording webm and a validation pass that re-checks impressions containing words like *fades / disappears / settles*. See [ADR 0005](./docs/decisions/0005-sparse-event-aliasing.md). Full video-tier reasoning ([#6](https://github.com/LPettay/dwell/issues/6)) is the gold-standard remaining fix.
- **Cookie consent modals.** Auto-dismissed via a DOM-scan heuristic that handles common frameworks (OneTrust, iubenda, didomi, etc.) and exact-match button text. Sites with custom or unusual consent UI may still slip through.
- **Mobile-only sites.** Use `--viewport mobile` (or `tablet`, or explicit `WxH`) to render at a non-desktop viewport.

### Open gaps (still fail)

- **Click-to-start affordances** — intro splashes, "Begin experience" gates. Dwell hovers but never clicks an entry button. Tracked as [#11](https://github.com/LPettay/dwell/issues/11).
- **Audio is silent.** Recording captures video only. Sites whose character is sound — music visualizers, podcast players, atmospheric audio — are reviewed as visuals only. Tracked as [#12](https://github.com/LPettay/dwell/issues/12).

### Out of scope (by design)

These aren't gaps; they're deliberate boundaries.

- **Login walls / paywalls / geo-blocks.** Dwell does not authenticate. It will produce an impression of the wall, not the product. Auth flow is task-completion territory — for that, use [browser-use](https://github.com/browser-use/browser-use) or write a Playwright wrapper that handles your auth, then point it at dwell's reasoning layer. See [#14](https://github.com/LPettay/dwell/issues/14).
- **Bot-detection evasion.** Sites protected by Cloudflare Turnstile, PerimeterX, DataDome, or hCaptcha may serve a challenge page; dwell records the challenge and describes it. Evasion would push dwell from *honest observation* into automation arms-race territory. For users who need this, [playwright-stealth](https://github.com/AtuboDad/playwright_stealth) or [undetected-playwright](https://github.com/QIN2DIM/undetected-playwright) are the right tools to compose with dwell, not to fold into it. See [#15](https://github.com/LPettay/dwell/issues/15).

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). The short version: every directory has an AGENTS.md, every structural choice gets an ADR, `bun run check` is the single hygiene gate, and `main` goes through PRs.

---

## License

MIT — see [`LICENSE`](./LICENSE).
