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

> Requires [Bun](https://bun.sh) ≥ 1.1, a Google AI Studio key, and a display server (WSLg works on WSL2; native X/Wayland everywhere else).

```bash
bun install
bun playwright install chromium    # if not already cached
echo "GEMINI_API_KEY=..." > .env

bun run dwell https://fireside.technology/
```

Open the produced markdown at `impressions/<host>-<timestamp>.md`.

### Flags

| Flag | Default | What it does |
|---|---|---|
| `--duration <seconds>` | `30` | How long to dwell. Choreography phases run inside this budget; remaining time is recorded as additional idle. |
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

Dwell tries to handle these and currently fails on them. They are tracked publicly so users know the edges.

- **Sparse-event aliasing.** Dwell samples ~6–9 keyframes per 25s session. Phenomena visible for less than ~T/N of their period — periodic motion with long periods and short visible windows — may be misread as one-shot events (e.g., an orbiting element described as "fading"). See [ADR 0005](./docs/decisions/0005-sparse-event-aliasing.md) for the diagnosis and the fix sequence; tracked as issues [#3](https://github.com/LPettay/dwell/issues/3)–[#6](https://github.com/LPettay/dwell/issues/6).
- **Cookie consent modals** block the actual content for the entire dwelling session on EU + many news sites; impression ends up reviewing the modal. Tracked as [#8](https://github.com/LPettay/dwell/issues/8).
- **Click-to-start affordances** (intro splashes, "Begin experience" gates) are dwelt on at the entry screen rather than the experience itself. Tracked as [#11](https://github.com/LPettay/dwell/issues/11).
- **Audio is silent.** Recording captures video only. Sites whose character is sound (music visualizers, podcast players, atmospheric audio) are reviewed as visuals only. Tracked as [#12](https://github.com/LPettay/dwell/issues/12).
- **Mobile-only sites** render their non-primary layout at the fixed 1280×800 viewport. Tracked as [#13](https://github.com/LPettay/dwell/issues/13).
- **Login walls / paywalls / geo-blocks** — dwell does not authenticate; it produces an impression of the wall, not the product. By design — see [#14](https://github.com/LPettay/dwell/issues/14).
- **Bot-detection challenges** (Cloudflare, Turnstile, etc.) may serve a challenge page. Dwell does not attempt to evade. By design — see [#15](https://github.com/LPettay/dwell/issues/15).

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). The short version: every directory has an AGENTS.md, every structural choice gets an ADR, `bun run check` is the single hygiene gate, and `main` goes through PRs.

---

## License

MIT — see [`LICENSE`](./LICENSE).
