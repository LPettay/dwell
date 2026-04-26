# AGENTS.md — src/types/

Shared Zod schemas + their inferred TypeScript types. The leaf of the dependency graph — depends on nothing internal.

## Index

### Files here

| File | Purpose |
|---|---|
| `session.ts` | `InteractionEvent`, `SessionManifest`, `Impression` schemas + types. |

---

## What belongs here

- Zod schemas that describe data crossing a boundary (LLM I/O, filesystem persistence, CLI args if they ever grow non-trivial).
- `z.infer<>` exports so consumers can use the type directly without re-running the schema.
- Pure types with no runtime behavior.

## What does not belong here

- Functions, even small ones — keep this directory data-only.
- Imports from other `src/` directories — types are the leaf.
- Schemas that are used only inside a single subdirectory — keep those local until they need to be shared.

## Conventions

- Every exported schema also exports its inferred type with the same name: `export type X = z.infer<typeof X>`.
- Boundary validation lives at the boundary (the consumer calls `.parse()`). This module just defines the shapes.
- A schema change is a structural change — update consumers in the same PR and consider an ADR if the change is observable.

---

---

<!-- last-reviewed: e2872b9 -->
