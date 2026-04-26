# ADR 0001: Use Bun as package manager and runtime

## Status

Accepted — 2026-04-25

## Context

Dwell is a TypeScript CLI / library. We need a single toolchain for install, run, and scripts. Lance has a global preference for Bun, and the sister project (MotionPitch) uses Bun — keeping the toolchain consistent across projects lowers cognitive overhead and makes the per-directory `AGENTS.md` enforcement scripts portable.

## Decision

Use Bun ≥ 1.1 as both package manager and runtime. Commit `bun.lock`. Forbid `npm`, `yarn`, and `pnpm` invocations and lockfiles. Run TypeScript directly via `bun src/...`, no build step.

## Consequences

- Faster install and startup vs. npm.
- Native TypeScript execution — no `tsx`, no transpile step in dev.
- The `bun run check` enforcement script is itself written for Bun, so contributors must have Bun installed.
- Documented in README quick start; install path ([bun.sh](https://bun.sh)) is one curl.
- WSL note: Bun's official installer uses unzip; if a contributor's WSL is missing it, Python's stdlib `zipfile` extracts the official zip release with no sudo.

## Alternatives considered

- **Node + tsx** — works, but adds a layer for TypeScript and we lose Bun's built-in `.env` loading and faster install.
- **pnpm** — fast, but contradicts the cross-project preference and adds an install step.
- **Deno** — TypeScript-native, but less mature ecosystem for Playwright and Anthropic/Google SDKs.
