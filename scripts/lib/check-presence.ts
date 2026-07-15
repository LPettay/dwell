// VENDORED from FleetManager templates/agents-crawl/lib — do not edit here; changes flow from FleetManager (see scripts/lib/VENDOR-MANIFEST.json)
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { walkDirs, dirHasFiles } from "./walk.ts";
import type { CheckResult, CrawlConfig, Finding } from "./types.ts";

/**
 * Layer 2a — every directory under `config.agentsRequiredRoots` that
 * contains files must have its own AGENTS.md.
 */
export function checkPresence(repoRoot: string, config: CrawlConfig): CheckResult {
  const findings: Finding[] = [];

  for (const root of config.agentsRequiredRoots) {
    const abs = join(repoRoot, root);
    if (!existsSync(abs)) continue;

    for (const entry of walkDirs(abs, repoRoot, config)) {
      if (!dirHasFiles(entry)) continue;

      const agentsPath = join(entry.abs, "AGENTS.md");
      if (!existsSync(agentsPath)) {
        findings.push({
          severity: "error",
          code: "AGENTS_MISSING",
          message: `Directory has files but no AGENTS.md`,
          path: relative(repoRoot, entry.abs) || ".",
          fix: `Create ${relative(repoRoot, agentsPath)} describing the directory's purpose, conventions, and what does/doesn't belong here.`,
        });
      }
    }
  }

  return { name: "presence", findings };
}
