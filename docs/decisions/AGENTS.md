# AGENTS.md — docs/decisions/

Architecture Decision Records. One short markdown per structural choice. Numbered sequentially. Numbers don't get reused.

## Index

### Files here

| File | Purpose |
|---|---|
| `0000-template.md` | Copy this for every new ADR. |
| `0001-use-bun.md` | Bun as package manager + runtime. |
| `0002-gemini-for-vision.md` | Why Gemini over Anthropic for the reasoning step. |
| `0003-record-then-reason.md` | Recording-then-reasoning is the architectural wedge. |
| `0004-headed-chromium-only.md` | Headless browsing defeats the point of a dwelling tool. |
| `0005-sparse-event-aliasing.md` | Owning the periodic-phenomena failure mode publicly in v0.1. |
| `0006-experience-unit-multi-url.md` | (Proposed) Replace single-URL firewall with a typed experience-unit boundary. |

---

## When to write an ADR

- A new dependency lands.
- A new top-level directory appears.
- The shape of a public schema changes (`SessionManifest`, `Impression`).
- A non-obvious tradeoff needs to be remembered six months from now.

When in doubt: write one. They're short.

## When not to write an ADR

- Bug fixes.
- Internal refactors that don't change behavior or surface area.
- Doc edits.
- Anything that fits in a commit message.

## Format

Copy `0000-template.md`. Sections: Status / Context / Decision / Consequences / Alternatives considered. Keep it under a page.

---

---

<!-- last-reviewed: e2872b9 -->
