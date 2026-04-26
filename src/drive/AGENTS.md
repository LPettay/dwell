# AGENTS.md — src/drive/

The dwelling choreography. Drives a real Chromium browser through a fixed sequence of phases designed to reveal a website's response, motion, and idle character.

## Index

### Files here

| File | Purpose |
|---|---|
| `dwell-session.ts` | `dwell(opts)` — open Chromium, run the choreography, write `session.json` + screenshots + webm. Returns the `SessionManifest`. |

---

## The choreography

`dwell-session.ts` runs phases in this order, each producing one or more events with optional screenshots:

1. **`initial`** — navigate, wait 1.5s, snap arrival
2. **`idle`** — wait 3s, snap (catches intro animations resolving)
3. **`sweep`** — cursor to upper-left → center → lower-right with 800ms hovers
4. **`hover`** — probe up to 3 visible affordances (`a`, `button`, `[role='button']`)
5. **`scroll`** — only if scrollable: halfway → bottom → back to top, snap each
6. **`settle`** — wait 2s, snap final frame

If you change a phase's timing or behavior, this is a structural change. Update [`docs/architecture.md`](../../docs/architecture.md) and consider an ADR.

## What belongs here

- Playwright orchestration code.
- Screenshot scheduling and the `InteractionEvent` log.
- Per-page idle detection and timing.

## What does not belong here

- Anything that talks to a model — that's `../reason/`.
- Anything that interprets the recording — recordings are emitted, not read, by `drive/`.
- General-purpose Playwright helpers (none yet; if a real one emerges, put it in `drive/lib/`).

## Conventions

- Headed Chromium is the default and only the default — see [ADR 0004](../../docs/decisions/0004-headed-chromium-only.md).
- Phases push events with millisecond timestamps relative to session start (`t0 = performance.now()`).
- Screenshots are full-page-false (just the viewport) to keep file sizes manageable and to match what the user sees at the moment of capture.
- All `try`/`catch` around interaction probing must NOT throw; flaky elements are skipped, not fatal.
- The session always runs for the requested duration even if the choreography finishes early — burn off remaining time so the recording is full-length.

---

