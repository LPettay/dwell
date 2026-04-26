#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dwell } from "../drive/dwell-session";
import { buildImpression, renderImpressionMarkdown } from "../reason/impression";
import { validateImpression } from "../reason/validate";

interface ParsedArgs {
  url: string;
  durationMs?: number;
  headed: boolean;
  viewport?: { width: number; height: number };
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let url: string | undefined;
  let durationMs: number | undefined;
  let headed = true;
  let viewport: { width: number; height: number } | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--headless") headed = false;
    else if (a === "--duration") durationMs = Number(args[++i]) * 1000;
    else if (a === "--viewport") viewport = parseViewport(args[++i]);
    else if (!url) url = a;
  }
  if (!url) {
    console.error("usage: dwell <url> [--duration <seconds>] [--viewport <preset|WxH>] [--headless]");
    console.error("       --viewport accepts: desktop (default), mobile, tablet, or e.g. 1920x1080");
    process.exit(2);
  }
  url = normalizeUrl(url);
  return { url, ...(durationMs !== undefined ? { durationMs } : {}), headed, ...(viewport ? { viewport } : {}) };
}

const VIEWPORT_PRESETS: Record<string, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
};

export function parseViewport(input: string | undefined): { width: number; height: number } {
  if (!input) {
    console.error("error: --viewport requires a value (preset name or WxH)");
    process.exit(2);
  }
  const preset = VIEWPORT_PRESETS[input.toLowerCase()];
  if (preset) return preset;
  const m = /^(\d+)x(\d+)$/i.exec(input);
  if (m) {
    const width = Number(m[1]);
    const height = Number(m[2]);
    if (width > 0 && height > 0) return { width, height };
  }
  console.error(`error: '${input}' is not a valid viewport (use 'desktop', 'mobile', 'tablet', or WxH like '1920x1080')`);
  process.exit(2);
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
  const { url, durationMs, headed, viewport } = parseArgs(process.argv);
  const host = slugHost(url);
  const stamp = timestamp();
  const sessionDir = join(process.cwd(), ".dwell-cache", `${host}-${stamp}`);
  await mkdir(sessionDir, { recursive: true });

  console.log(`▶ dwelling on ${url}`);
  console.log(`  session dir: ${sessionDir}`);
  if (viewport) console.log(`  viewport:    ${viewport.width}x${viewport.height}`);
  if (!headed) console.log(`  (headless mode — note that this skips visible motion)`);

  const manifest = await dwell({
    url,
    outDir: sessionDir,
    headed,
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(viewport ? { viewport } : {}),
  });
  console.log(`✓ recorded ${manifest.events.length} events over ${(manifest.durationMs / 1000).toFixed(1)}s`);
  console.log(`  video:       ${manifest.videoPath}`);

  console.log(`▶ asking the model to write an impression…`);
  const initial = await buildImpression({ manifest });

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.DWELL_MODEL ?? "gemini-2.5-pro";
  let validation: Awaited<ReturnType<typeof validateImpression>> | undefined;
  if (apiKey) {
    const result = await validateImpression({ impression: initial, manifest, apiKey, model });
    if (result.triggeredBy.length > 0) {
      if (result.revised) {
        console.log(`⚠ validation pass revised the impression (triggered by: ${result.triggeredBy.join(", ")})`);
        if (result.revisionReason) console.log(`  reason: ${result.revisionReason}`);
      } else {
        console.log(`✓ validation pass confirmed (triggered by: ${result.triggeredBy.join(", ")})`);
      }
      validation = result;
    }
  }
  const impression = validation?.impression ?? initial;

  const impressionsDir = join(process.cwd(), "impressions");
  await mkdir(impressionsDir, { recursive: true });
  const outPath = join(impressionsDir, `${host}-${stamp}.md`);
  await writeFile(
    outPath,
    renderImpressionMarkdown(impression, manifest, {
      ...(validation
        ? {
            validation: {
              triggeredBy: validation.triggeredBy,
              revised: validation.revised,
              ...(validation.revisionReason !== undefined ? { reason: validation.revisionReason } : {}),
              ...(validation.denseFramesUsed !== undefined ? { denseFramesUsed: validation.denseFramesUsed } : {}),
            },
          }
        : {}),
    }),
  );
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
