# AGENTS.md — src/cli/

The `dwell` CLI entry point. The thinnest possible layer over `drive/` and `reason/` — argv parsing, output paths, top-level error handling.

## Index

### Files here

| File | Purpose |
|---|---|
| `dwell.ts` | `dwell <url> [--duration <s>] [--headless]` — drive a session, generate an impression, write both to disk. |

---

## What belongs here

- Argv parsing and validation.
- Filesystem orchestration (where session caches and impressions land).
- Top-level error handling — anything thrown below this layer should surface a useful message.
- Logging the user-visible progress (`▶`, `✓`).

## What does not belong here

- The dwelling logic itself (lives in `../drive/`).
- The model call (lives in `../reason/`).
- Schema definitions (live in `../types/`).

## Conventions

- The CLI is one file. If it grows past ~150 lines, split argv parsing into `args.ts` and orchestration into `run.ts` before adding more.
- No business logic. The CLI's job is to wire `drive` to `reason` and persist the result.
- Exit code `0` on success, `1` on any failure (the script's `.catch()` handles this).
- Output paths are derived deterministically: `.dwell-cache/<host>-<timestamp>/` for sessions, `impressions/<host>-<timestamp>.md` for the final markdown.

---

---

<!-- last-reviewed: e2872b9 -->
