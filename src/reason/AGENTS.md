# AGENTS.md — src/reason/

The vision-model boundary. Reads a `SessionManifest` + screenshots, produces an `Impression`. This is the only directory in the project that talks to an LLM.

## Index

### Files here

| File | Purpose |
|---|---|
| `impression.ts` | `buildImpression(opts)` — Gemini multi-image call with chronological content + structured output. Combines per-phase screenshots with dense frames extracted from the webm via `../capture/`. `renderImpressionMarkdown(...)` formats the result for disk. |
| `validate.ts` | `validateImpression(opts)` — second pass that runs only when the impression contains stop-words (`fades`, `disappears`, `vanishes`, `stops`, `settles`, etc.). Re-samples a denser frame set via `../capture/` and asks the model to confirm or revise. See ADR 0005. |

---

## What belongs here

- System prompts for any model task in this codebase.
- The model client (Google `@google/genai`) and structured-output schemas.
- Frame sampling / model-budget logic (capped at MAX_FRAMES per call to keep token cost predictable).
- Markdown rendering of the final impression.

## What does not belong here

- Driving the browser (that's `../drive/`).
- Arg parsing (that's `../cli/`).
- Frame-extraction primitives — those live in `../capture/`. This module orchestrates extraction; it doesn't shell out to ffmpeg directly.

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
