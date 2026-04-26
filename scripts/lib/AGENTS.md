# AGENTS.md — scripts/lib/

Pure modules used by the entry-point scripts in `scripts/`. Each file does one thing.

## Index

### Files here

| File | Purpose |
|---|---|
| `config.ts` | The single source of truth for what's enforced — required AGENTS.md roots, ignored dirs, forbidden files, freshness threshold, stamp format. |
| `walk.ts` | `walkDirs()` — yields one entry per directory under a root, skipping ignored paths. |
| `git.ts` | Thin wrappers around `git rev-parse`, `git cat-file`, `git diff --name-only`. |
| `types.ts` | `Finding`, `CheckResult`, `Severity` — the structured report format. |
| `check-presence.ts` | Layer 2a — every meaningful directory must have an AGENTS.md. |
| `check-forbidden.ts` | Layer 2c — no foreign lockfiles or committed `.env*` files. |
| `check-freshness.ts` | Layer 5 — every AGENTS.md must carry a current `<!-- last-reviewed: SHA -->` stamp. |

---

## What belongs here

- Pure functions and small helpers consumed by `scripts/check.ts` or `scripts/stamp.ts`.
- The single config module that all checks share.

## What does not belong here

- I/O orchestration with arg parsing — that lives in `../check.ts` and `../stamp.ts`.
- Anything imported from `src/`.

## Conventions

- A new check is a single file `check-<name>.ts` exporting a `CheckResult`.
- Wire it into `../check.ts` by adding the id to the `CheckId` union and dispatching on it.
- Findings carry a stable `code` (e.g. `STAMP_STALE`) so failures are greppable.
- Never throw inside a check function — return findings.

---

---

<!-- last-reviewed: e2872b9 -->
