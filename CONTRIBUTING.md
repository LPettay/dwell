# Contributing

Dwell is a small library + CLI. These conventions exist so multiple contributors (humans + AI agents) can ship without stepping on each other.

---

## Ground rules

1. **The dwelling pipeline always runs.** If `dwell https://fireside.technology/` doesn't end-to-end produce an impression on `main`, that's a P0.
2. **AGENTS.md is mandatory** for every directory under `src/`, `docs/`, and `scripts/` that contains files. The `bun run check` gate fails commits that skip this.
3. **Document structural decisions.** New dependency, new directory, schema change → write an ADR in [`docs/decisions/`](./docs/decisions/).

---

## Branching

- `main` is always shippable.
- Feature branches: `feat/<short-description>`
- Fix branches: `fix/<short-description>`
- Docs branches: `docs/<short-description>`
- Chore branches: `chore/<short-description>`

---

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/). Imperative, lowercase, no trailing period.

```
feat: capture network trace alongside video
fix: handle non-scrollable pages gracefully
docs: add ADR for record-then-reason architecture
chore: bump @google/genai to 1.50.1
```

---

## Pull requests

`main` is intended to be branch-protected. Every change goes through this loop:

```bash
git switch main && git pull --ff-only
git switch -c feat/<short-slug>
# ... do the work ...
bun run check          # quick local sanity (pre-commit will too)
bun run typecheck
git add . && git commit -m "feat: ..."
git push -u origin HEAD
gh pr create --fill
gh pr merge --squash --delete-branch
git switch main && git pull --ff-only
```

Squash-merge so `main` history is one-commit-per-PR. The Conventional Commit title becomes the commit message on `main`.

---

## Parallel agents → one worktree per agent

A single git checkout has one `HEAD`. Two AI sessions sharing the same checkout will trample each other's `git switch`. If you spin up a parallel agent, give it its own worktree:

```bash
git worktree add ../Dwell-wt/feat-network-trace feat/network-trace
```

Open the worktree path in the new session. Independent `HEAD`, index, stash, and pre-commit hook invocation per worktree.

---

## Code style

- TypeScript strict mode is on. No `any` without a one-line `// why-any: ...` comment.
- Functional style preferred. No classes unless an SDK requires one.
- Explain *why*, not *what*. No narrating comments.
- One concern per file. If a file exceeds ~200 lines, consider splitting.
- `import` paths inside `src/` use the `@/` alias.

---

## Enforcement (5 layers)

| Layer | What it catches | When |
|---|---|---|
| **1. Documentation** | Intent only — describes the rules | Always |
| **2. `bun run check`** | Missing AGENTS.md, forbidden lockfiles, stale stamps | Manual or pre-commit |
| **3. Pre-commit (lefthook)** | Runs `bun run check` + typecheck automatically | Every `git commit` |
| **4. CI (GitHub Actions)** | Backstop — same checks on every push and PR | CI |
| **5. Branch protection** | Solo-merges allowed; PR + CI still required | GitHub side |

### Freshness contract

Every `AGENTS.md` has a footer:

```markdown
<!-- last-reviewed: 0d84014 -->
```

When more than 5 non-AGENTS files in its directory change after that SHA, the doc is stale. `bun run check` fails until you:

1. Read the current `AGENTS.md` for that directory.
2. Read the diff: `git diff <sha>..HEAD -- <dir>`.
3. Edit if it's wrong.
4. Re-stamp: `bun run agents:stamp <path>`.

Stamp every doc at once after a sweeping review: `bun run agents:stamp-all`.
See what's currently stale: `bun run agents:stale`.

### Bypassing

`git commit --no-verify` skips pre-commit hooks. CI still gates push. Document the bypass reason in the commit body.

---

## Stack constraints (do not violate)

- **Package manager: Bun.** Never `npm`, `yarn`, `pnpm`. `bun.lock` is committed.
- **Runtime: Bun.** Direct TypeScript execution; no build step.
- **Browser driver: Playwright.** Not Puppeteer, not Selenium.
- **Reasoning model: Google Gemini** via `@google/genai`. See [ADR 0002](./docs/decisions/0002-gemini-for-vision.md).
- **Headed Chromium only** for real impressions. See [ADR 0004](./docs/decisions/0004-headed-chromium-only.md).
