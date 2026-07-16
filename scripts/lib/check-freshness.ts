// VENDORED from FleetManager templates/agents-crawl/lib — do not edit here; changes flow from FleetManager (see scripts/lib/VENDOR-MANIFEST.json)
import { existsSync, readFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { walkDirs } from "./walk.ts";
import { changedFilesIn, shaExists, hasHead } from "./git.ts";
import type { CheckResult, CrawlConfig, Finding } from "./types.ts";

/**
 * Layer 5 — every AGENTS.md carries a `<!-- last-reviewed: SHA -->` footer.
 * If more than `config.freshnessThreshold` files in its directory have
 * changed since that SHA (excluding the AGENTS.md itself), the doc is stale
 * and must be re-reviewed and re-stamped.
 *
 * Bootstrap exception: in a brand-new repo with no HEAD ref yet (i.e. the
 * very first commit), all freshness findings degrade to warnings — there's
 * nothing to compare against, and missing stamps are about to be filled in
 * by `bun run agents:stamp-all` immediately after the first commit.
 */
export function checkFreshness(
  repoRoot: string,
  config: CrawlConfig,
  opts: { verbose?: boolean } = {},
): CheckResult {
  const findings: Finding[] = [];
  const bootstrap = !hasHead();
  const sev = (real: "error" | "warn"): "error" | "warn" => (bootstrap ? "warn" : real);

  const targets: string[] = [];
  const rootAgents = join(repoRoot, "AGENTS.md");
  if (existsSync(rootAgents)) targets.push(rootAgents);
  for (const root of config.agentsRequiredRoots) {
    const abs = join(repoRoot, root);
    if (!existsSync(abs)) continue;
    for (const entry of walkDirs(abs, repoRoot, config)) {
      const agentsPath = join(entry.abs, "AGENTS.md");
      if (existsSync(agentsPath)) targets.push(agentsPath);
    }
  }

  for (const agentsPath of targets) {
    const content = readFileSync(agentsPath, "utf8");
    const sha = parseStamp(content, config);
    const relAgents = relative(repoRoot, agentsPath);
    const relDir = dirname(relAgents) || ".";

    if (!sha) {
      findings.push({
        severity: sev("error"),
        code: "STAMP_MISSING",
        message: `AGENTS.md has no '<!-- last-reviewed: SHA -->' footer`,
        path: relAgents,
        fix: `Run: bun run agents:stamp ${relAgents}`,
      });
      continue;
    }

    if (!shaExists(sha)) {
      findings.push({
        severity: sev("error"),
        code: "STAMP_INVALID",
        message: `Stamp SHA '${sha}' is not reachable from HEAD`,
        path: relAgents,
        fix: `Re-stamp after reviewing: bun run agents:stamp ${relAgents}`,
      });
      continue;
    }

    const changed = changedFilesIn(sha, relDir).filter(
      (p) => !p.endsWith("/AGENTS.md") && p !== `${relDir}/AGENTS.md` && p !== "AGENTS.md",
    );

    if (changed.length > config.freshnessThreshold) {
      const detail = opts.verbose ? `\n        changed: ${changed.join(", ")}` : "";
      findings.push({
        severity: sev("error"),
        code: "STAMP_STALE",
        message: `AGENTS.md is stale: ${changed.length} files changed in ${relDir}/ since ${sha} (threshold: ${config.freshnessThreshold})${detail}`,
        path: relAgents,
        fix: `Review the diff, update AGENTS.md if needed, then: bun run agents:stamp ${relAgents}`,
      });
    }
  }

  return { name: "freshness", findings };
}

/**
 * Parse a `<!-- last-reviewed: SHA -->` footer out of an AGENTS.md body using
 * the consumer's configured marker. Kept lib-local so consumers don't need to
 * export a `parseStamp` helper from their config — `stampPrefix`/`stampSuffix`
 * are sufficient.
 */
function parseStamp(content: string, config: CrawlConfig): string | null {
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
