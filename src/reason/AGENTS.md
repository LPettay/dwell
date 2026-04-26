# AGENTS.md — src/reason/

The vision-model boundary. Reads a `SessionManifest` + screenshots, produces an `Impression`. This is the only file in the project that talks to an LLM.

## Index

### Files here

| File | Purpose |
|---|---|
| `impression.ts` | `buildImpression(opts)` calls Gemini with chronological multi-image content + structured output. `renderImpressionMarkdown(impression, manifest)` formats the result for disk. |

---

## What belongs here

- The system prompt for the impression task.
- The model client (Google `@google/genai`) and the structured-output schema.
- Frame sampling logic (we cap to 12 evenly-spaced frames to keep token cost predictable).
- Markdown rendering of the final impression.

## What does not belong here

- Driving the browser (that's `../drive/`).
- Arg parsing (that's `../cli/`).
- Any prompt or model call other than the impression — if a second LLM-using flow emerges, give it its own file (`impression.ts`, `summary.ts`, etc.).

## Conventions

- Read the API key from `process.env.GEMINI_API_KEY` (Bun loads `.env` automatically). Never hardcode keys, never log them.
- Use Gemini's native `responseSchema` for structured output. Don't ask for JSON in the prompt and parse it tolerantly — let the SDK enforce the schema.
- Validate the parsed result with Zod (`ImpressionResponse.parse(...)`) at the boundary. If the model returns malformed JSON, fail loudly rather than silently producing garbage.
- The system prompt explicitly forbids implementation speculation, qualia claims, and marketing copy. Keep it that way — see [ADR 0003](../../docs/decisions/0003-record-then-reason.md).
- The default model is `gemini-2.5-pro`. Override with `DWELL_MODEL` or `opts.model`. Document any model-specific behavior here if it emerges.

## Why Gemini, not Claude

See [ADR 0002](../../docs/decisions/0002-gemini-for-vision.md). Short version: Gemini was the available key; the SDK supports multi-image vision + structured output natively; the swap is one file if we ever change.

---

---

<!-- last-reviewed: e2872b9 -->
