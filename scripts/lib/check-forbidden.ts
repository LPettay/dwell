import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import type { CheckResult, Finding } from "./types.ts";

/**
 * Layer 2c — forbidden artifacts must not exist at the repo root.
 *
 * These are typically lockfiles from the wrong package manager or stray
 * `.env` files that shouldn't be committed.
 */
export function checkForbidden(repoRoot: string): CheckResult {
  const findings: Finding[] = [];

  for (const file of config.forbiddenFiles) {
    const abs = join(repoRoot, file);
    if (existsSync(abs)) {
      findings.push({
        severity: "error",
        code: "FORBIDDEN_FILE",
        message: `Forbidden file present at repo root`,
        path: file,
        fix: fixHint(file),
      });
    }
  }

  return { name: "forbidden", findings };
}

function fixHint(file: string): string {
  if (file.endsWith(".lock") || file.endsWith(".lockb") || file.endsWith(".yaml") || file.endsWith(".json")) {
    return `Use bun. Delete ${file} and run 'bun install' to regenerate bun.lock.`;
  }
  if (file.startsWith(".env.production")) {
    return `Don't keep production secrets in the dev tree. Use .env (gitignored) for local dev, and put prod keys in your deploy provider's secret store.`;
  }
  return `Remove ${file} from the repo root.`;
}
