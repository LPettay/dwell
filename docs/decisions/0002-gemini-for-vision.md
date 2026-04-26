# ADR 0002: Use Gemini for the impression-generation step

## Status

Accepted — 2026-04-25

## Context

The reasoning stage takes a chronological sequence of screenshots plus an interaction log and produces a written impression. This is a multi-image vision-language task with a structured-output requirement (the impression has fixed fields).

The initial scaffold of `AGENTS.md` declared Anthropic as the model provider. When we attempted to run end-to-end, Lance had a Google AI Studio key (`GEMINI_API_KEY`) immediately available from the sister hackathon project, but no Anthropic key set up locally. Rather than block on credential provisioning, we evaluated Gemini for the same job.

## Decision

Use Google's `@google/genai` SDK with `gemini-2.5-pro` as the default model. Read `GEMINI_API_KEY` from `.env`. Allow `DWELL_MODEL` to override.

Gemini supports:
- Multi-image input via `inlineData` parts in the same `contents` array, interleaved with text labels.
- Native structured output via `responseMimeType: "application/json"` + `responseSchema`, removing the need for tolerant JSON-extraction logic.
- A system instruction separate from the user content.

## Consequences

- One file (`src/reason/impression.ts`) crosses the model boundary. If we ever need to switch providers (for cost, quality, or strategic reasons), the change is local and small.
- Validated end-to-end on day 0 against `https://fireside.technology/`. The impression captured details (cursor-driven flame motion, tooltip hover behavior, settling animation) that single-screenshot vision pipelines cannot see.
- We're not on the same provider as the rest of the agent ecosystem (Claude Code, the conversation that birthed the project). For *this* component that's fine — the reasoning step is a one-shot tool call, not a persistent agent.

## Alternatives considered

- **Anthropic Claude (vision)** — strong vision model, same vendor as the calling agent (Claude Code). Blocked at v0.1 by the missing API key. Could be revisited if we want a unified-provider story; the SDK swap is mechanical.
- **OpenAI GPT-4o** — multi-image works; structured outputs work. No key locally and no advantage over Gemini for this task.
- **Local VLM (LLaVA, etc.)** — eliminates API cost but adds GPU dependency and quality regression. Out of scope until we have a reason to care about offline operation.
