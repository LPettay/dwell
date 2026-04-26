# AGENTS.md — src/

The dwell library + CLI. Three stages, in this order: drive → capture → reason.

## Index

### Subdirectories

| Path | Purpose |
|---|---|
| [`cli/`](./cli/AGENTS.md) | The `dwell` CLI entry point. Argv parsing, orchestration, file output. |
| [`drive/`](./drive/AGENTS.md) | Playwright session driver — the dwelling choreography. |
| [`reason/`](./reason/AGENTS.md) | Vision-model boundary — recording artifact → impression. |
| [`types/`](./types/AGENTS.md) | Zod schemas: `InteractionEvent`, `SessionManifest`, `Impression`. |

### Planned (not yet created)

| Path | Purpose | Pointer |
|---|---|---|
| `capture/` | Reserved for video/log post-processing helpers (frame extraction, log compaction) if they ever grow beyond what `drive/` handles inline. | None — landed when needed. |

---

## Dependency direction

```
cli/  →  drive/, reason/, types/
drive/ →  types/
reason/ →  types/
types/  → (leaf, depends on nothing internal)
```

`cli/` depends on everything below; `types/` depends on nothing. Never invert this. If `drive/` needs something from `reason/`, it's a smell — push the shared piece down into `types/` or extract a new lib.

## What belongs in src/

- The CLI, the library code, the schemas.
- Code that runs at runtime, either via `bun src/cli/dwell.ts` or via `import` from another consumer.

## What does not belong here

- Repo-hygiene tooling (`scripts/`).
- Docs (`docs/`).
- Anything that builds the docs or produces shipped artifacts.

## Conventions

- Imports use the `@/` alias to refer to other src files: `import { X } from "@/types/session"`.
- Each subdirectory is one concern; if a file fits in two, put it in `types/` and let both use it.
- Boundary points (LLM input, LLM output, user CLI args) validate with Zod. Internal calls trust their callers.
- No `any` without a one-line `// why-any: ...` comment.

---

