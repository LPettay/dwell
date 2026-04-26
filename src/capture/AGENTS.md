# AGENTS.md — src/capture/

Post-recording helpers that extract structured artifacts from what the driver produced. The driver writes raw webm + per-phase screenshots; capture turns those into things the reasoning step can consume.

## Index

### Files here

| File | Purpose |
|---|---|
| `extract-frames.ts` | `extractFrames(webm, outDir, { intervalSeconds, maxFrames })` — pulls evenly-spaced PNG frames from a webm via ffmpeg's `fps=1/N` filter. Used by `reason/` to mitigate sparse-event aliasing (ADR 0005). |

---

## What belongs here

- Pure, side-effecting helpers that operate on the recording artifact.
- ffmpeg / ffprobe wrappers.
- Future: log compaction, network-trace summarization, audio extraction.

## What does not belong here

- Anything that talks to a model — that's `../reason/`.
- Anything that drives the browser — that's `../drive/`.
- Filesystem layout decisions — those are made by the CLI / drive layer; capture consumes paths it's given.

## Conventions

- Helpers throw on hard failure (ffmpeg missing, unreadable webm). Callers in `reason/` decide whether to fall back gracefully.
- Output directories are passed in by the caller — capture never invents paths.
- Spawn external processes with explicit args, no shell expansion.
- ffmpeg is required to be on `PATH`; document this in the README quick-start. Playwright also bundles ffmpeg under `~/.cache/ms-playwright/ffmpeg-*`, but we don't reach for it — keeping the dependency explicit is more honest than auto-discovering Playwright's internals.

---

---

<!-- last-reviewed: 669b04f -->
