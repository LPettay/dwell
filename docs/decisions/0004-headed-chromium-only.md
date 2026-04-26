# ADR 0004: Headed Chromium only — no headless mode for v0.1

## Status

Accepted — 2026-04-25

## Context

Playwright supports both headed and headless Chromium. Headless is faster, doesn't need a display, and is the default for CI / scraping use cases.

For Dwell, headless is the wrong choice. A site's character lives in motion: GPU-accelerated transforms, WebGL/Three.js, video, smooth scrolling, transitions. Headless Chromium *can* render WebGL, but several things differ enough from headed that a "what is the site like" reading is degraded:

- WebGL/canvas rendering can fall back to software paths under headless on some systems.
- `prefers-reduced-motion` and other media queries may resolve differently.
- Sites that detect headless (`navigator.webdriver`, common patterns) may show different content.
- Hover state on touch-emulated viewports is unreliable.

The CLI exposes a `--headless` flag for debugging the pipeline (e.g., when no display is available), but the recording produced under headless should be considered diagnostic, not a real impression.

## Decision

`dwell <url>` defaults to headed. Headed runs are the only ones that produce trustworthy impressions. The `--headless` flag exists for pipeline debugging only; if we find ourselves using it for real impressions, that is a bug in our environment, not a feature to support.

WSL is supported via WSLg (built into WSL2). The `DISPLAY` env var must be set (typically `:0` under WSLg).

## Consequences

- Anyone running Dwell needs a display server (or WSLg, or a virtual display via `xvfb-run`).
- CI cannot run Dwell end-to-end without an X server; instead, CI runs lint + typecheck + the repo-hygiene `bun run check`. Integration tests of the dwelling pipeline are local-only for now.
- The README and CLI help message clearly say "headed" so contributors aren't surprised by a window opening.

## Alternatives considered

- **Headless by default with `--headed` opt-in** — easier for CI, wrong for the product. Rejected.
- **Configurable per-URL** — over-engineered. Headed is right for the use case; the flag is escape-hatch only.
