import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { InteractionEvent, SessionManifest } from "../types/session";

export interface DwellOptions {
  url: string;
  outDir: string;
  durationMs?: number;
  headed?: boolean;
}

const DEFAULT_DURATION_MS = 30_000;

/**
 * The dwelling strategy: open a real browser, sit with the page, and probe it
 * with the kind of casual interaction a curious human would. We capture the
 * whole session as video and keep a chronological event log with screenshots
 * pinned at moments worth reasoning about.
 */
export async function dwell(opts: DwellOptions): Promise<SessionManifest> {
  const duration = opts.durationMs ?? DEFAULT_DURATION_MS;
  const recordingsDir = join(opts.outDir, "recordings");
  const screenshotsDir = join(opts.outDir, "screenshots");
  await mkdir(recordingsDir, { recursive: true });
  await mkdir(screenshotsDir, { recursive: true });

  const headed = opts.headed ?? true;
  const browser: Browser = await chromium.launch({ headless: !headed });
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: recordingsDir, size: { width: 1280, height: 800 } },
    deviceScaleFactor: 1,
  });

  const startedAt = new Date();
  const t0 = performance.now();
  const events: InteractionEvent[] = [];

  const page: Page = await context.newPage();

  const log = (phase: InteractionEvent["phase"], action: string, note?: string) => {
    events.push({ t: Math.round(performance.now() - t0), phase, action, ...(note ? { note } : {}) });
  };

  const snap = async (phase: InteractionEvent["phase"], action: string, note?: string) => {
    const t = Math.round(performance.now() - t0);
    const filename = `t${String(t).padStart(6, "0")}-${phase}.png`;
    const screenshotPath = join(screenshotsDir, filename);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false });
      events.push({ t, phase, action, screenshotPath, ...(note ? { note } : {}) });
    } catch (err) {
      events.push({ t, phase, action, note: `screenshot-failed: ${String(err)}` });
    }
  };

  log("initial", "navigate", opts.url);
  await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 20_000 });

  // Phase 1: arrival snapshot (the "first impression" frame)
  await page.waitForTimeout(1_500);
  await snap("initial", "arrival", "after DOMContentLoaded + 1.5s settle");

  // Phase 2: idle observation — let any intro animation play out
  await page.waitForTimeout(3_000);
  await snap("idle", "post-intro", "+3s of stillness");

  // Phase 3: cursor sweep — three positions across the viewport, with hover dwells
  const sweepPoints: Array<[number, number, string]> = [
    [320, 200, "upper-left third"],
    [640, 400, "center"],
    [960, 600, "lower-right third"],
  ];
  for (const [x, y, where] of sweepPoints) {
    await page.mouse.move(x, y, { steps: 12 });
    await page.waitForTimeout(800);
    await snap("hover", `cursor at ${where}`, `(${x},${y})`);
  }

  // Phase 4: probe interactive affordances — hover any visible buttons / links
  // briefly to see if the site responds.
  try {
    const links = await page.locator("a, button, [role='button']").all();
    const probeCount = Math.min(3, links.length);
    for (let i = 0; i < probeCount; i++) {
      const link = links[i];
      if (!link) continue;
      try {
        const visible = await link.isVisible();
        if (!visible) continue;
        await link.hover({ timeout: 1_000 });
        await page.waitForTimeout(600);
        const label = (await link.textContent({ timeout: 500 }))?.trim().slice(0, 40) ?? "<unlabeled>";
        await snap("hover", "hover affordance", label);
      } catch {
        // skip flaky elements
      }
    }
  } catch {
    log("hover", "affordance-probe-failed");
  }

  // Phase 5: scroll the page if it's tall enough to scroll
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewportHeight = 800;
  if (scrollHeight > viewportHeight + 100) {
    await page.mouse.wheel(0, scrollHeight / 2);
    await page.waitForTimeout(800);
    await snap("scroll", "halfway-down", `scrollHeight=${scrollHeight}`);
    await page.mouse.wheel(0, scrollHeight);
    await page.waitForTimeout(800);
    await snap("scroll", "near-bottom");
    await page.mouse.wheel(0, -scrollHeight * 2);
    await page.waitForTimeout(800);
    await snap("scroll", "back-to-top");
  } else {
    log("scroll", "page-not-scrollable", `scrollHeight=${scrollHeight}`);
  }

  // Phase 6: settle — one last frame after everything else
  await page.waitForTimeout(2_000);
  await snap("settle", "final-frame", "session ending");

  // Burn off remaining time so we always have ~duration of recording.
  const elapsed = performance.now() - t0;
  const remaining = duration - elapsed;
  if (remaining > 0) await page.waitForTimeout(remaining);

  const totalMs = Math.round(performance.now() - t0);
  await context.close();
  await browser.close();

  // Find the produced video (Playwright names it with a random hash).
  const videoFile = await findRecording(recordingsDir);
  const manifest: SessionManifest = {
    url: opts.url,
    startedAt: startedAt.toISOString(),
    durationMs: totalMs,
    videoPath: videoFile ?? "(missing)",
    events,
  };
  await writeFile(join(opts.outDir, "session.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function findRecording(dir: string): Promise<string | null> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir);
  const webm = entries.find((e) => e.endsWith(".webm"));
  return webm ? join(dir, webm) : null;
}
