import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { InteractionEvent, SessionManifest } from "../types/session";

export interface DwellOptions {
  url: string;
  outDir: string;
  durationMs?: number;
  headed?: boolean;
  viewport?: { width: number; height: number };
}

const DEFAULT_DURATION_MS = 30_000;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
/** Cap on scroll-to-grow iterations during the scroll phase (lazy-load support). */
const MAX_SCROLL_ITERATIONS = 5;

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
  const viewport = opts.viewport ?? DEFAULT_VIEWPORT;
  const browser: Browser = await chromium.launch({ headless: !headed });
  const context: BrowserContext = await browser.newContext({
    viewport,
    recordVideo: { dir: recordingsDir, size: viewport },
    deviceScaleFactor: 1,
  });

  const startedAt = new Date();
  const t0 = performance.now();
  const events: InteractionEvent[] = [];

  const page: Page = await context.newPage();

  const log = (phase: InteractionEvent["phase"], action: string, note?: string) => {
    events.push({ t: Math.round(performance.now() - t0), phase, action, ...(note ? { note } : {}) });
  };

  // Auto-dismiss alert / confirm / beforeunload dialogs so they don't hang
  // the dwelling loop. The text is logged so the impression has context.
  page.on("dialog", async (dialog) => {
    const message = dialog.message().slice(0, 200);
    log("dialog", `dialog:${dialog.type()}`, message || undefined);
    try {
      await dialog.dismiss();
    } catch {
      // dialog already handled or page closed; ignore
    }
  });

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

  // Pre-phase: best-effort consent-modal dismissal so the arrival frame
  // captures the actual site, not the cookie banner.
  await page.waitForTimeout(1_500);
  const consent = await tryDismissConsent(page);
  if (consent.dismissed) {
    log("consent", "dismissed", consent.via ?? undefined);
    await page.waitForTimeout(500);
  }

  // Phase 1: arrival snapshot (the "first impression" frame)
  await snap("initial", "arrival", consent.dismissed ? "post-consent-dismiss" : "after DOMContentLoaded + 1.5s settle");

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

  // Phase 5: scroll the page if it's tall enough to scroll. Loops the
  // scroll-to-bottom until either the document stops growing or the
  // iteration cap is hit — this surfaces lazy-loaded content that's only
  // mounted when scrolled into view.
  const initialScrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  if (initialScrollHeight > viewport.height + 100) {
    await page.mouse.wheel(0, initialScrollHeight / 2);
    await page.waitForTimeout(800);
    await snap("scroll", "halfway-down", `scrollHeight=${initialScrollHeight}`);

    let lastHeight = initialScrollHeight;
    let iteration = 0;
    while (iteration < MAX_SCROLL_ITERATIONS) {
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" as ScrollBehavior }));
      await page.waitForTimeout(900);
      const newHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      if (newHeight <= lastHeight + 50) break;
      iteration += 1;
      await snap("scroll", "lazy-grow", `iter=${iteration} height=${newHeight}`);
      lastHeight = newHeight;
    }
    await snap("scroll", "near-bottom", `final-scrollHeight=${lastHeight}${iteration > 0 ? ` (${iteration} lazy-grow iters)` : ""}`);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
    await page.waitForTimeout(800);
    await snap("scroll", "back-to-top");
  } else {
    log("scroll", "page-not-scrollable", `scrollHeight=${initialScrollHeight}`);
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

/**
 * Best-effort dismissal of cookie / consent modals.
 *
 * Three-pass:
 *   1. Known framework selectors (OneTrust, iubenda, etc.).
 *   2. Buttons whose text matches affirmative-consent patterns (\`Accept\`,
 *      \`Got it\`, \`I agree\`).
 *   3. Generic info-banner dismissal — close-affordance text (\`Close\`,
 *      \`Dismiss\`, \`No thanks\`, \`×\`) plus \`aria-label\` fallback for
 *      icon-only X buttons. Pass 3 is geometry-guarded: it only clicks when
 *      the candidate sits inside a fixed/sticky container that either covers
 *      a sizeable chunk of the viewport or hugs an edge — banners do, but
 *      tooltips, dropdowns, and inline notification badges don't.
 *
 * Heuristic by design — silent miss when no candidate is found, no false
 * positives on sign-up CTAs (we match exact text patterns, not substrings).
 */
async function tryDismissConsent(page: Page): Promise<{ dismissed: boolean; via?: string }> {
  const candidate = await page.evaluate(() => {
    const knownIds = [
      "onetrust-accept-btn-handler",
      "iubenda-cs-accept-btn",
      "cc-accept",
      "cookie-accept",
      "cookie-consent-accept",
      "cmp-accept-all",
      "didomi-notice-agree-button",
    ];
    for (const id of knownIds) {
      const byId = document.getElementById(id);
      if (byId && (byId as HTMLElement).offsetParent !== null) {
        return { selector: `#${CSS.escape(id)}`, kind: "id" };
      }
      const byClass = document.querySelector<HTMLElement>(`.${CSS.escape(id)}`);
      if (byClass && byClass.offsetParent !== null) {
        return { selector: `.${CSS.escape(id)}`, kind: "class" };
      }
    }

    // Exact text match (case-insensitive) — exact patterns avoid catching
    // sign-up buttons or other non-consent CTAs.
    const exactPatterns = [
      "accept all",
      "accept all cookies",
      "accept",
      "i agree",
      "got it",
      "allow all",
      "allow all cookies",
      "ok",
      "agree",
      "agree and close",
    ];
    const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role='button']"));
    for (const el of candidates) {
      if (el.offsetParent === null) continue;
      const text = (el.textContent ?? "").trim().toLowerCase();
      if (!text) continue;
      if (exactPatterns.includes(text)) {
        const tag = `dwell-consent-${Math.random().toString(36).slice(2, 10)}`;
        el.setAttribute("data-dwell-consent", tag);
        return { selector: `[data-dwell-consent="${tag}"]`, kind: "text" };
      }
    }

    // Pass 3 — info-banner dismissal affordances.
    //
    // Affirmative passes get first refusal so a real "Accept" wins over a
    // nearby "X". "got it" deliberately stays in Pass 2 (affirmative) — it's
    // closer to consent than dismissal and we don't want it duplicated.
    const dismissPatterns = [
      "close",
      "dismiss",
      "no thanks",
      "maybe later",
      "skip",
      "x",
      "×", // multiplication-sign close glyph
    ];

    // Geometry guard: a banner-like overlay either covers >20% of the
    // viewport OR is anchored full-width / full-height to an edge. Tooltips,
    // dropdowns, cart popovers, and inline notification badges fail both.
    const looksLikeBanner = (el: HTMLElement): boolean => {
      let node: HTMLElement | null = el;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (style.position === "fixed" || style.position === "sticky") {
          const rect = node.getBoundingClientRect();
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          if (vw === 0 || vh === 0) return false;
          const areaRatio = (rect.width * rect.height) / (vw * vh);
          if (areaRatio > 0.2) return true;
          // Edge anchoring: full-width band on top/bottom or full-height
          // strip on left/right. Tolerate a few pixels of inset.
          const fullWidth = rect.width >= vw * 0.95;
          const fullHeight = rect.height >= vh * 0.95;
          const hugsTop = rect.top <= 4;
          const hugsBottom = rect.bottom >= vh - 4;
          const hugsLeft = rect.left <= 4;
          const hugsRight = rect.right >= vw - 4;
          if (fullWidth && (hugsTop || hugsBottom)) return true;
          if (fullHeight && (hugsLeft || hugsRight)) return true;
          // A fixed/sticky ancestor that's neither big nor edge-hugging
          // (e.g. a tooltip, popover) — bail out so we don't keep walking
          // up into an unrelated outer fixed shell.
          return false;
        }
        node = node.parentElement;
      }
      return false;
    };

    const tagAndReturn = (el: HTMLElement, kind: string) => {
      const tag = `dwell-consent-${Math.random().toString(36).slice(2, 10)}`;
      el.setAttribute("data-dwell-consent", tag);
      return { selector: `[data-dwell-consent="${tag}"]`, kind };
    };

    // 3a: visible-text dismissal candidates.
    for (const el of candidates) {
      if (el.offsetParent === null) continue;
      const text = (el.textContent ?? "").trim().toLowerCase();
      if (!text) continue;
      if (!dismissPatterns.includes(text)) continue;
      if (!looksLikeBanner(el)) continue;
      return tagAndReturn(el, "text-dismiss");
    }

    // 3b: aria-label fallback for icon-only X buttons.
    const ariaCandidates = Array.from(document.querySelectorAll<HTMLElement>("button[aria-label], [role='button'][aria-label], a[aria-label]"));
    for (const el of ariaCandidates) {
      if (el.offsetParent === null) continue;
      const label = (el.getAttribute("aria-label") ?? "").trim().toLowerCase();
      if (!label) continue;
      if (!dismissPatterns.includes(label)) continue;
      if (!looksLikeBanner(el)) continue;
      return tagAndReturn(el, "aria-dismiss");
    }

    return null;
  });

  if (!candidate) return { dismissed: false };

  try {
    await page.locator(candidate.selector).click({ timeout: 1500 });
    return { dismissed: true, via: candidate.kind };
  } catch {
    return { dismissed: false };
  }
}
