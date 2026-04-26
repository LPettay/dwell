# Architecture

```
   ╭──────────────╮      ╭───────────────╮      ╭──────────────────╮
   │  dwell <url> │ ───▶ │   recording   │ ───▶ │   impression     │
   │   (CLI)      │      │  (mp4 + log)  │      │   (markdown)     │
   ╰──────────────╯      ╰───────────────╯      ╰──────────────────╯
        drive                 capture                  reason
     (Playwright)          (filesystem)               (Gemini)
```

The pipeline is three stages, in strict order:

## 1. Drive — `src/drive/dwell-session.ts`

Open headed Chromium via Playwright. Navigate to the URL. Then run a fixed dwelling choreography:

| Phase | What happens | Why |
|---|---|---|
| `initial` | Navigate, wait 1.5s, snap | First impression — what the site looks like the moment it's "ready." |
| `idle` | Wait 3s, snap | Catch any intro animation that plays itself out. |
| `sweep` | Cursor moves to upper-left, center, lower-right with hover dwells | A site's interactive layer is invisible until the cursor arrives. |
| `hover` | Hover the first 3 visible affordances (links/buttons) | See what the site says back. |
| `scroll` | Halfway down → bottom → back to top, snapping each | Reveal below-the-fold content if any. |
| `settle` | Wait 2s, snap | What does the site look like once you stop touching it? |

The whole session is recorded by Playwright as a webm. Screenshots at each phase boundary are saved separately so the reasoning stage can attach them as discrete images.

## 2. Capture — filesystem

The session writes to `.dwell-cache/<host>-<timestamp>/`:

```
.dwell-cache/fireside.technology-2026-04-25T20-21-00/
├── recordings/page@<hash>.webm
├── screenshots/
│   ├── t002913-initial.png
│   ├── t006061-idle.png
│   ├── t007193-hover.png
│   └── ...
└── session.json
```

`session.json` is the canonical chronological log. Every event has a millisecond timestamp, a phase, an action, and (where applicable) the screenshot path. Schema in [`src/types/session.ts`](../src/types/session.ts).

## 3. Reason — `src/reason/impression.ts`

Read `session.json`. Sample up to 12 evenly-spaced screenshots (the model has a context budget). Build a single Gemini multimodal request with chronological text labels interleaved with images:

```
text:  URL: https://fireside.technology/  Dwell: 25.0s  Frames: 9
text:  [t=2.9s · initial · arrival — after DOMContentLoaded + 1.5s settle]
image: <png>
text:  [t=6.1s · idle · post-intro — +3s of stillness]
image: <png>
...
```

Gemini returns a JSON object matching this schema:

```ts
{
  firstFiveSeconds: string,
  afterExploration: string,
  settling: string,
  oneSentenceVerdict: string,
}
```

Validated by Zod at the boundary. Rendered to markdown with frontmatter (`url`, `generated_at`, `model`, `dwell_duration_seconds`, `video`) and written to `./impressions/<host>-<timestamp>.md`.

The recording is preserved alongside the impression. A human can rewatch the webm and judge whether the impression rings true.

---

## Why this shape

**Record-then-reason, not snapshot-then-act.** A single screenshot is a frame; a website is motion + response. Capture the temporal experience first, reason about it as a coherent artifact second. See [ADR 0003](./decisions/0003-record-then-reason.md).

**Boundaries are validated.** Both the LLM input (image bytes) and output (impression JSON) cross trust boundaries. Zod schemas at every boundary; never trust a model response.

**Storage is the artifact.** The recording + log are durable. The impression is regenerable — point at the same session dir with a different model or prompt and the impression updates without re-driving the browser.
