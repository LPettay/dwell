#!/usr/bin/env bun
/**
 * Orchestrates all repo-hygiene checks.
 *
 * Usage:
 *   bun run check                    # run everything, fail on any error
 *   bun run check --only=presence    # run a subset
 *   bun run check --verbose          # show extra detail (e.g. stale file lists)
 *
 * Exit codes:
 *   0  — all checks passed
 *   1  — at least one error finding
 *   2  — bad invocation
 */

import { resolve } from "node:path";
import { config } from "./lib/config.ts";
import { checkPresence } from "./lib/check-presence.ts";
import { checkForbidden } from "./lib/check-forbidden.ts";
import { checkFreshness } from "./lib/check-freshness.ts";
import type { CheckResult, Finding } from "./lib/types.ts";

type CheckId = "presence" | "forbidden" | "freshness";
const ALL: CheckId[] = ["presence", "forbidden", "freshness"];

function parseArgs(argv: string[]): { only: CheckId[]; verbose: boolean } {
  let only: CheckId[] = ALL;
  let verbose = false;

  for (const arg of argv.slice(2)) {
    if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg.startsWith("--only=")) {
      const ids = arg.slice("--only=".length).split(",").map((s) => s.trim());
      for (const id of ids) {
        if (!ALL.includes(id as CheckId)) {
          console.error(`unknown check id: ${id} (valid: ${ALL.join(", ")})`);
          process.exit(2);
        }
      }
      only = ids as CheckId[];
    } else {
      console.error(`unknown arg: ${arg}`);
      process.exit(2);
    }
  }

  return { only, verbose };
}

function main(): void {
  const { only, verbose } = parseArgs(process.argv);
  const repoRoot = resolve(import.meta.dir, "..");

  const results: CheckResult[] = [];
  if (only.includes("presence")) results.push(checkPresence(repoRoot, config));
  if (only.includes("forbidden")) results.push(checkForbidden(repoRoot, config));
  if (only.includes("freshness")) results.push(checkFreshness(repoRoot, config, { verbose }));

  printReport(results);

  const errors = results.flatMap((r) => r.findings).filter((f) => f.severity === "error");
  process.exit(errors.length > 0 ? 1 : 0);
}

function printReport(results: CheckResult[]): void {
  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0);

  for (const r of results) {
    const hasError = r.findings.some((f) => f.severity === "error");
    const hasWarn = r.findings.some((f) => f.severity === "warn");
    const status = hasError ? "FAIL" : hasWarn ? "WARN" : "PASS";
    const icon = hasError ? "✗" : hasWarn ? "⚠" : "✓";
    console.log(`${icon} ${status.padEnd(4)} ${r.name}`);
    for (const f of r.findings) {
      printFinding(f);
    }
  }

  console.log("");
  if (totalFindings === 0) {
    console.log("All checks passed.");
  } else {
    const errorCount = results.flatMap((r) => r.findings).filter((f) => f.severity === "error").length;
    const warnCount = results.flatMap((r) => r.findings).filter((f) => f.severity === "warn").length;
    console.log(`${errorCount} error${errorCount === 1 ? "" : "s"}, ${warnCount} warning${warnCount === 1 ? "" : "s"}.`);
  }
}

function printFinding(f: Finding): void {
  const tag = f.severity === "error" ? "ERROR" : "WARN ";
  const where = f.path ? ` ${f.path}` : "";
  console.log(`    ${tag} [${f.code}]${where}`);
  console.log(`      ${f.message}`);
  if (f.fix) {
    console.log(`      fix: ${f.fix}`);
  }
}

main();
