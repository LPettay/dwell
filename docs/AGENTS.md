# AGENTS.md — docs/

Project-level documentation that doesn't belong in source comments or README.

## Index

### Files here

| File | Purpose |
|---|---|
| `architecture.md` | The dwelling pipeline end-to-end: drive → capture → reason → impression. |

### Subdirectories

| Path | Purpose |
|---|---|
| [`decisions/`](./decisions/AGENTS.md) | ADRs — one short markdown per structural decision. |

---

## What belongs here

- Architecture diagrams or explanations that span multiple files in `src/`.
- ADRs in `decisions/`.
- Long-form rationale that would clutter the README.

## What does not belong here

- Documentation of a single file's API — that lives next to the code.
- Per-template or per-feature briefs unless they cross-cut multiple modules.
- Generated docs (typedoc, etc.) — keep this folder hand-written.

## Conventions

- Every structural decision gets an ADR. See [`decisions/0000-template.md`](./decisions/0000-template.md).
- Keep the architecture doc current — it's the highest-leverage file for an agent ramping up. If a structural change makes it wrong, update it in the same PR.

---

---

<!-- last-reviewed: e2872b9 -->
