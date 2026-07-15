// VENDORED from FleetManager templates/agents-crawl/lib — do not edit here; changes flow from FleetManager (see scripts/lib/VENDOR-MANIFEST.json)
export type Severity = "error" | "warn";

export type Finding = {
  severity: Severity;
  /** Stable machine-readable code, e.g. "AGENTS_MISSING". */
  code: string;
  /** Human-readable message. */
  message: string;
  /** File or directory path the finding relates to. */
  path?: string;
  /** Optional fix hint. */
  fix?: string;
};

export type CheckResult = {
  name: string;
  findings: Finding[];
};

export function ok(name: string): CheckResult {
  return { name, findings: [] };
}

/**
 * Per-repo configuration shape passed into every check function.
 *
 * Consumer repos define a `config.ts` next to the symlinked lib files that
 * exports a `config` object matching this shape, plus `formatStamp` /
 * `parseStamp` helpers that key off `stampPrefix` / `stampSuffix`. The
 * consumer's `scripts/check.ts` entry point loads its own config and threads
 * it into `checkPresence(repoRoot, config)` etc.
 *
 * We accept the whole config in each check rather than slicing per-function
 * subsets — signatures stay stable as the lib evolves, and the consumer
 * always has the full object on hand anyway.
 *
 * `readonly` and `ReadonlySet` are used so a consumer's `as const` literal
 * (the canonical pattern, see `config.example.ts`) assigns cleanly.
 */
export type CrawlConfig = {
  /** Directories that must contain an AGENTS.md if they contain other files. */
  readonly agentsRequiredRoots: readonly string[];
  /** Directory names skipped entirely when walking the tree. */
  readonly ignoreDirs: ReadonlySet<string>;
  /** Files that must not exist at the repo root. */
  readonly forbiddenFiles: readonly string[];
  /** Max non-AGENTS files that may change in a dir before its AGENTS.md is "stale". */
  readonly freshnessThreshold: number;
  /** Footer marker prefix written / parsed by stamp.ts (e.g. "<!-- last-reviewed:"). */
  readonly stampPrefix: string;
  /** Footer marker suffix (e.g. "-->"). */
  readonly stampSuffix: string;
};
