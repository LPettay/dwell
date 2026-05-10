/**
 * Per-repo seam for the AGENTS.md crawl infrastructure.
 *
 * The other files in `scripts/lib/` (walk, git, types, check-*) are symlinks
 * back to the FleetManager template at
 * `~/FleetManager/templates/agents-crawl/lib/`. DO NOT edit those — edit this
 * file. The lib files take this config as a parameter; `scripts/check.ts` and
 * `scripts/stamp.ts` thread it through each call.
 *
 * `satisfies CrawlConfig` ensures any drift from the template's contract
 * fails typecheck immediately.
 */

import type { CrawlConfig } from "./types.ts";

export const config = {
  /** Directories that must contain an AGENTS.md if they contain other files. */
  agentsRequiredRoots: ["src", "docs", "scripts"] as const,

  /** Subpaths to skip entirely when walking. */
  ignoreDirs: new Set([
    "node_modules",
    "dist",
    "build",
    ".git",
    "coverage",
    ".dwell-cache",
    "recordings",
    "impressions",
    "playwright-report",
    "test-results",
  ]),

  /**
   * Files that should never live at the repo root.
   *
   * `.env` and `.env.local` are intentionally NOT forbidden — Bun auto-loads
   * `.env`, and forbidding the only sensible local-dev location is
   * counterproductive when the file is already gitignored. `.env.production`
   * stays forbidden because a prod key in a dev tree is always a smell.
   */
  forbiddenFiles: [
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".env.production",
    ".env.production.local",
  ] as const,

  /**
   * Freshness threshold: an AGENTS.md is "stale" when more than this many
   * non-AGENTS files in its directory have changed since its last-reviewed
   * stamp.
   */
  freshnessThreshold: 5,

  /** Footer marker used by stamp.ts. */
  stampPrefix: "<!-- last-reviewed:",
  stampSuffix: "-->",
} as const satisfies CrawlConfig;

export function formatStamp(sha: string): string {
  return `${config.stampPrefix} ${sha} ${config.stampSuffix}`;
}

export function parseStamp(content: string): string | null {
  const re = new RegExp(
    `${escapeRe(config.stampPrefix)}\\s*([0-9a-f]{7,40})\\s*${escapeRe(config.stampSuffix)}`,
    "i",
  );
  const match = re.exec(content);
  return match?.[1] ?? null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
