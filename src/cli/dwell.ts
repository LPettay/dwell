#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dwell } from "../drive/dwell-session";
import { buildImpression, renderImpressionMarkdown } from "../reason/impression";

function parseArgs(argv: string[]): { url: string; durationMs?: number; headed: boolean } {
  const args = argv.slice(2);
  let url: string | undefined;
  let durationMs: number | undefined;
  let headed = true;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--headless") headed = false;
    else if (a === "--duration") durationMs = Number(args[++i]) * 1000;
    else if (!url) url = a;
  }
  if (!url) {
    console.error("usage: dwell <url> [--duration <seconds>] [--headless]");
    process.exit(2);
  }
  url = normalizeUrl(url);
  return { url, ...(durationMs !== undefined ? { durationMs } : {}), headed };
}

/**
 * Accept bare hostnames (`example.com`) and add `https://` when no scheme is
 * present. Anything with an existing scheme passes through. Genuinely
 * malformed input exits with a useful argparse-style error rather than a
 * downstream stack trace.
 */
export function normalizeUrl(input: string): string {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    console.error(`error: '${input}' is not a valid URL`);
    process.exit(2);
  }
}

function slugHost(url: string): string {
  return new URL(url).host.replace(/[^a-z0-9.-]/gi, "_");
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

async function main() {
  const { url, durationMs, headed } = parseArgs(process.argv);
  const host = slugHost(url);
  const stamp = timestamp();
  const sessionDir = join(process.cwd(), ".dwell-cache", `${host}-${stamp}`);
  await mkdir(sessionDir, { recursive: true });

  console.log(`▶ dwelling on ${url}`);
  console.log(`  session dir: ${sessionDir}`);
  if (!headed) console.log(`  (headless mode — note that this skips visible motion)`);

  const manifest = await dwell({
    url,
    outDir: sessionDir,
    headed,
    ...(durationMs !== undefined ? { durationMs } : {}),
  });
  console.log(`✓ recorded ${manifest.events.length} events over ${(manifest.durationMs / 1000).toFixed(1)}s`);
  console.log(`  video:       ${manifest.videoPath}`);

  console.log(`▶ asking the model to write an impression…`);
  const impression = await buildImpression({ manifest });

  const impressionsDir = join(process.cwd(), "impressions");
  await mkdir(impressionsDir, { recursive: true });
  const outPath = join(impressionsDir, `${host}-${stamp}.md`);
  await writeFile(outPath, renderImpressionMarkdown(impression, manifest));
  console.log(`✓ impression written: ${outPath}`);
  console.log(`\n  ${impression.oneSentenceVerdict}\n`);
}

// Only run when invoked as the entry point (not when imported, e.g. by tests).
if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
  });
}
