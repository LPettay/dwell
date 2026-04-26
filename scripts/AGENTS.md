# AGENTS.md — scripts/

Repo-hygiene tooling. The single command `bun run check` reports every violation in this repo and exits non-zero on any error. Lefthook runs it on pre-commit; CI runs it on every push.

## Index

### Files here

| File | Purpose |
|---|---|
| `check.ts` | Entry point. Orchestrates `presence`, `forbidden`, and `freshness` checks, prints a structured report. |
| `stamp.ts` | Marks an `AGENTS.md` (or all of them) as reviewed at the current HEAD SHA. |

### Subdirectories

| Path | Purpose |
|---|---|
| [`lib/`](./lib/AGENTS.md) | Check helpers — config, walk, git, types, individual checks. |

---

## What belongs here

- One-shot enforcement scripts run via `bun run <name>`.
- Repo-wide tooling that the developer or CI runs, but not anything the runtime needs.

## What does not belong here

- Anything imported from `src/`. Scripts run as standalone bun programs and must not depend on app code.
- Build tools, bundlers, or anything that produces shipped artifacts.

## Conventions

- Each script is self-contained: imports only from `./lib/` or node stdlib.
- Scripts use `import.meta.dir` + `resolve(..., "..")` to find the repo root, never `process.cwd()`.
- Exit codes: `0` = pass, `1` = check failure, `2` = bad invocation.
- New checks land as a file in `lib/check-<name>.ts` and a wired entry in `check.ts`.

---

---

<!-- last-reviewed: e2872b9 -->
