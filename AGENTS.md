# AGENTS.md — Repo Root

Authoritative agent instructions for this repository. Any AI agent should read this before any non-trivial edit.

Each subdirectory has its own `AGENTS.md` with scope-specific guidance — read those too when working within that directory.

---

## Crawl map

```
.
├── AGENTS.md                       ← you are here (constraints, scope firewall, freshness contract)
├── docs/AGENTS.md                  Architecture + ADR conventions
│   └── decisions/AGENTS.md         ADR format + when to write one
├── scripts/AGENTS.md               Repo-hygiene scripts (check, stamp)
│   └── lib/AGENTS.md               Check helper modules (config, walk, git, types, individual checks)
└── src/AGENTS.md                   Library + CLI source root
    ├── cli/AGENTS.md               `dwell` CLI entry point
    ├── drive/AGENTS.md             Playwright session driver — the dwelling choreography
    ├── reason/AGENTS.md            Vision-model boundary: artifact → impression
    └── types/AGENTS.md             Shared Zod schemas (leaf — depends on nothing)
```

---

## Project at a glance

**Dwell** — A framework for an AI agent to truly experience a website. The agent drives a real browser, records the session as a temporal artifact, and emits a written *impression* a human can read and recognize.

**The wedge:** VLMs see frames, not motion. Most of a website's character lives in *response* — easings, idle behavior, hover feedback, what happens when you wait. Dwell records the experience first and reasons about it second. See [ADR 0003](./docs/decisions/0003-record-then-reason.md).

**The implementation trick:** record-then-reason, not snapshot-then-act. The recording is the source of truth; the impression is a derived artifact. A human can replay the recording to audit the impression.

---

## Hard constraints (do not violate)

| Concern | Rule |
|---|---|
| Package manager | **`bun` only.** Never `npm`, `yarn`, `pnpm`. |
| Runtime | Bun. Direct TypeScript execution; no build step. |
| Language | TypeScript, strict mode. No `any` without a one-line `// why-any: ...` comment. |
| Browser driver | **Playwright** only. Not Puppeteer, not Selenium. |
| Browser mode | Headed Chromium for real impressions. `--headless` is debug-only. See [ADR 0004](./docs/decisions/0004-headed-chromium-only.md). |
| Reasoning model | **Google `@google/genai`** with structured outputs. Validate with Zod at the boundary. See [ADR 0002](./docs/decisions/0002-gemini-for-vision.md). |
| Comments | Explain *why*, not *what*. No narrating comments. |
| Scope | This is a **dwelling** tool, not a task-completion agent. See [Anti-scope-creep firewall](#anti-scope-creep-firewall). |

---

## Definition of "done" for v0.1

Met as of 2026-04-25. The CLI runs end-to-end:

```bash
bun install
bun run dwell https://fireside.technology/
```

…opens headed Chromium, dwells ~25–30s, writes a video + screenshot log + `session.json` to `.dwell-cache/`, sends the artifact to Gemini, writes a markdown impression to `impressions/`. The first dogfooded impression of `fireside.technology` correctly identified the cursor-driven flame motion, rotating monospace text rings, glowing floor grid, and tooltip behavior on the icon row — details a single-screenshot pipeline cannot see.

P0 if any of these break:

1. The CLI runs to completion without crashing on a representative URL.
2. The recording is produced and the webm is replayable.
3. The impression file is written and is non-empty, on-topic prose.
4. Re-running on the same URL produces a recognizably consistent impression (not deterministic, but coherent).

Everything else is P2 or lower.

---

## Anti-scope-creep firewall

Out of scope:

- Task completion (filling forms, logging in, purchasing — use [browser-use](https://github.com/browser-use/browser-use) or Playwright directly)
- Structured data scraping
- Multi-page crawling beyond what dwelling on a single URL implies
- Running headless as the default (defeats the point — see [ADR 0004](./docs/decisions/0004-headed-chromium-only.md))
- Replacing test runners or accessibility tooling
- A web UI / dashboard for impressions
- A SaaS hosted version
- Any claim about machine consciousness, qualia, or sentience in user-facing copy or docs

If a contributor (human or AI) proposes one of these, redirect to [`docs/decisions/`](./docs/decisions/) — it needs an ADR before any code lands.

---

## How to work here as an agent

1. **Read the relevant directory's `AGENTS.md`** before editing files in it.
2. **Prefer editing existing files** over creating new ones.
3. **Before suggesting a new dependency**, check if Bun + Playwright + `@google/genai` + Zod already covers it. They usually do.
4. **Before running `bun add <pkg>`**, confirm with the human.
5. **After substantive edits**, run `bun run check` and `bun run typecheck`. Fix anything you broke.
6. **Structural decisions** (new directory, new dependency, schema change, change to the dwelling choreography) get an ADR in `docs/decisions/`.
7. **Commit messages** follow Conventional Commits.
8. **Never commit directly to `main`** — every change goes through a PR.
9. **If you are a parallel agent, you are in a worktree.** A single checkout has one `HEAD`; two sessions sharing one checkout will silently trample each other's `git switch`.

## Index convention

Every `AGENTS.md` carries an **Index** section near the top with up to three sub-tables — include only the ones that apply:

- **Files here** — files that actually exist in the directory today, one-line purpose each.
- **Subdirectories** — direct subdirs, each linked to its own `AGENTS.md`, one-line purpose each.
- **Planned (not yet created)** — files the directory's design calls for but that haven't been written yet, with a pointer to where the plan lives. Agents should NOT try to read these.

When you add a file, add an entry. When you create a file from "Planned", move its row from Planned to Files here.

---

## Enforcement (5 layers)

| Layer | What it catches | When |
|---|---|---|
| **1. Documentation** | Intent only — describes the rules | Always |
| **2. `bun run check`** | Missing AGENTS.md, forbidden lockfiles, stale stamps | Manual or pre-commit |
| **3. Pre-commit (lefthook)** | Runs `bun run check` + typecheck on every commit | Every `git commit` |
| **4. CI (GitHub Actions)** | Backstop — same checks on every push and PR | CI |
| **5. Branch protection** | Solo-merges allowed; PR + CI still required as paper trail | GitHub side, when wired |

### Freshness contract

Every `AGENTS.md` carries a footer:

```markdown
<!-- last-reviewed: e2872b9 -->
```

When more than 5 non-AGENTS files in its directory change after that SHA, the doc is stale. `bun run check` fails until you:

1. Read the current `AGENTS.md`.
2. Read the diff: `git diff <sha>..HEAD -- <dir>`.
3. Edit the AGENTS.md if it no longer reflects reality.
4. Re-stamp: `bun run agents:stamp <path>`.

`bun run agents:stamp-all` stamps every doc at once after a sweeping review.
`bun run agents:stale` reports what's currently stale.

---

## What to ask the human about

Decisions that need human sign-off:
- Changes to the dwelling choreography (idle time, hover sweep pattern, scroll cadence)
- Changes to the impression schema or the system prompt that produces it
- Any new npm dependency
- Anything that would change v0.1's definition of done

Decisions you can make autonomously:
- Bug fixes
- TypeScript type tightening
- Internal refactors that don't change behavior
- Adding tests
- Documentation improvements

---

