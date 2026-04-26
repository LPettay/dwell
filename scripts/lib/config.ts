/**
 * Enforcement configuration. Tweak with care — these values shape the
 * friction surface of the project.
 */

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
} as const;

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
