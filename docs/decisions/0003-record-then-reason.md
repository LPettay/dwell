# ADR 0003: Record-then-reason is the architectural wedge

## Status

Accepted — 2026-04-25

## Context

Browser-agent frameworks today (browser-use, WebArena, Playwright + LLM glue) collapse a dynamic webpage to a single (DOM, screenshot) tuple at decision time. The model sees one frame. It then asks "what should I click."

That works for tasks. It throws away everything that makes a website *feel* like itself: motion, easings, idle behavior, what happens when the cursor moves, response cadence, sound, the thirty seconds where you just sit and watch. A vision-language model handed a single screenshot of `https://fireside.technology/` cannot see that the pixel-flame is reacting to the cursor — it sees a still image.

If we want an agent to truly *experience* a website, the perception layer cannot be a screenshot.

## Decision

The Dwell architecture is **record-then-reason**, not **snapshot-then-act**:

1. The browser session is recorded as a temporal artifact (video + chronological interaction log + sampled keyframe screenshots).
2. The reasoning model receives the *artifact*, not the live page.
3. The reasoning model emits a derived impression. The recording remains durable.

The driver runs a fixed choreography (initial → idle → sweep → hover → scroll → settle) deliberately designed to surface response and motion. The model gets to see the page across time, not at one instant.

## Consequences

- The driver is decoupled from the model. We can re-reason an old recording with a new model or new prompt, without re-driving the browser. The recording is the source of truth.
- Storage cost: a 25-second session is ~17MB of webm + ~3MB of screenshots. Acceptable for a dwelling tool; would not be acceptable for a high-throughput task agent.
- We cannot do live closed-loop interaction. An agent using Dwell observes; it does not act on the site. This is a deliberate scope boundary — see [Anti-scope-creep firewall](../../AGENTS.md#anti-scope-creep-firewall).
- Determinism: the choreography is fixed, but a site's animation is not. Two dwell runs of the same URL produce different recordings. The impression should be coherent across runs but not byte-identical.

## Alternatives considered

- **Live agent with VLM in the loop** — the model sees screenshots and decides what to do next. Higher latency per step, harder to audit, doesn't capture motion better than recording does, and re-litigates every decision per call. Save for task-completion projects.
- **Pure video understanding** — send the entire mp4 to a video model. Higher quality in principle, but more expensive, slower, and current video models are still weaker than multi-image reasoning over keyframes for our specific question. Re-evaluate when video models improve.
- **DOM-only reasoning** — strictly worse than what dwell already does. The whole point of this project is that the DOM is not the experience.
