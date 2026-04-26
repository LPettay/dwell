import { GoogleGenAI, Type, type Part } from "@google/genai";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { extractFrames, type ExtractedFrame } from "../capture/extract-frames";
import type { SessionManifest, Impression } from "../types/session";

const SYSTEM_PROMPT = `You are an experiential reviewer of websites.

You are given a chronological sequence of screenshots from a "dwelling" session — an automated browser opened the URL, sat with it, swept the cursor across it, hovered a few interactive elements, and scrolled. Each screenshot is preceded by a timestamp + label describing what was happening at that moment. The user message will tell you exactly how many frames you have and over what duration; treat that as your sampling resolution.

Write a short impression that another human, who has actually been on the site, would read and recognize. Be specific about what you can see — typography, color, motion cues, layout density, what changed between frames when the cursor moved or the page scrolled. Do not speculate about implementation. Do not make claims about consciousness, qualia, or "experience" in any philosophical sense. Don't write marketing copy.

## Reasoning under sparse sampling

Your view of the site is N frames over T seconds, ~T/N apart. You should reason about what that sampling rate can and cannot resolve:

- Phenomena visible for less than ~T/N of their period may appear in zero frames or one frame purely by chance. A single positive observation is consistent with both "X happened once" and "X happens periodically and you caught one cycle."
- When you describe a state change — particularly that something "fades", "stops", "disappears", "vanishes", or "settles" — distinguish what you actually observed from what you inferred. "I saw the entity at t=1.6s and not at t=6s, t=10s, t=14s" is an observation. "The entity fades away" is an inference and may be wrong if the period exceeds your dwelling duration.
- Prefer hedged language for inferences supported by a single positive frame: "appears briefly and is not seen again in the sampled window" rather than "fades away within seconds." Use confident language when multiple frames support the same state.
- If you suspect an animation is periodic but you can't confirm the period from your sample, say so. That is more useful than a wrong narrative.`;

const ImpressionResponse = z.object({
  firstFiveSeconds: z.string(),
  afterExploration: z.string(),
  settling: z.string(),
  oneSentenceVerdict: z.string(),
});

export interface BuildImpressionOpts {
  manifest: SessionManifest;
  model?: string;
  apiKey?: string;
  /**
   * If true (default), extract additional evenly-spaced frames from the
   * session webm via ffmpeg in addition to the per-phase screenshots.
   * Disable for environments without ffmpeg or for debugging.
   */
  denseFrames?: boolean;
}

const DEFAULT_MODEL = "gemini-2.5-pro";
/** Total frames sent to the model; covers token-cost upper bound. */
const MAX_FRAMES = 16;
/** Target spacing for dense frames extracted from the webm. */
const DENSE_INTERVAL_SECONDS = 1.5;

interface TimedFrame {
  /** Seconds from session start. */
  t: number;
  path: string;
  /** Short label for the chronological text annotation. */
  label: string;
}

export async function buildImpression(opts: BuildImpressionOpts): Promise<Impression> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required (set in .env or env).");
  }
  const model = opts.model ?? process.env.DWELL_MODEL ?? DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  const phaseFrames: TimedFrame[] = opts.manifest.events
    .filter((e) => e.screenshotPath)
    .map((e) => ({
      t: e.t / 1000,
      path: e.screenshotPath!,
      label: `${e.phase} · ${e.action}${e.note ? ` — ${e.note}` : ""}`,
    }));

  const denseEnabled = opts.denseFrames ?? true;
  const denseFrames = denseEnabled ? await tryExtractDense(opts.manifest) : [];

  const allFrames = [...phaseFrames, ...denseFrames].sort((a, b) => a.t - b.t);
  if (allFrames.length === 0) {
    throw new Error("No frames available — nothing for the model to see.");
  }

  const sampled = sampleEvenly(allFrames, MAX_FRAMES);

  const T = opts.manifest.durationMs / 1000;
  const N = sampled.length;
  const interval = N > 1 ? T / (N - 1) : T;
  const parts: Part[] = [
    {
      text:
        `URL: ${opts.manifest.url}\n` +
        `Dwell duration: ${T.toFixed(1)}s\n` +
        `Frames: ${N}  (≈ one frame every ${interval.toFixed(1)}s)\n\n` +
        `Sampling resolution note: any visual phenomenon visible for less ` +
        `than ~${interval.toFixed(1)}s of its period may appear in zero or one frames purely ` +
        `by chance. Hedge language about "fades / stops / disappears" when only one frame supports it. ` +
        `Periodic phenomena with period > ${T.toFixed(0)}s cannot be resolved from this sample at all.\n\n` +
        `The screenshots below are in chronological order. Each is preceded by a timestamp + label.`,
    },
  ];
  for (const frame of sampled) {
    parts.push({
      text: `\n[t=${frame.t.toFixed(1)}s · ${frame.label}]`,
    });
    const bytes = await readFile(frame.path);
    parts.push({
      inlineData: { mimeType: "image/png", data: bytes.toString("base64") },
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          firstFiveSeconds: { type: Type.STRING, description: "what arrival is like, 2-4 sentences" },
          afterExploration: { type: Type.STRING, description: "what the site reveals once you poke at it, 2-4 sentences" },
          settling: { type: Type.STRING, description: "what the site is like to sit with, 1-3 sentences" },
          oneSentenceVerdict: { type: Type.STRING, description: "a single sentence — what is this site, in spirit?" },
        },
        required: ["firstFiveSeconds", "afterExploration", "settling", "oneSentenceVerdict"],
        propertyOrdering: ["firstFiveSeconds", "afterExploration", "settling", "oneSentenceVerdict"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Model returned no text.");
  const parsed = ImpressionResponse.parse(JSON.parse(text));

  return {
    url: opts.manifest.url,
    generatedAt: new Date().toISOString(),
    model,
    ...parsed,
  };
}

function sampleEvenly<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * step);
    const item = arr[idx];
    if (item !== undefined) out.push(item);
  }
  return out;
}

async function tryExtractDense(manifest: SessionManifest): Promise<TimedFrame[]> {
  if (!manifest.videoPath || manifest.videoPath === "(missing)") return [];
  const T = manifest.durationMs / 1000;
  const targetCount = Math.min(MAX_FRAMES, Math.ceil(T / DENSE_INTERVAL_SECONDS));
  if (targetCount <= 0) return [];
  const interval = T / targetCount;

  // Frames land in a sibling of recordings/, under the same session root.
  const sessionRoot = dirname(dirname(manifest.videoPath));
  const denseDir = join(sessionRoot, "dense-frames");

  let extracted: ExtractedFrame[];
  try {
    extracted = await extractFrames(manifest.videoPath, denseDir, {
      intervalSeconds: interval,
      maxFrames: targetCount,
    });
  } catch (err) {
    // ffmpeg missing or failed — fall back to phase-aligned only. Surface the
    // reason so users can fix it if they care, but don't crash the impression.
    console.warn(`dwell: dense-frame extraction skipped (${err instanceof Error ? err.message : String(err)})`);
    return [];
  }

  return extracted.map((f) => ({ t: f.t, path: f.path, label: "dense-sample" }));
}

export interface RenderImpressionOpts {
  /** Audit metadata recorded in the markdown frontmatter. */
  validation?: {
    triggeredBy: string[];
    revised: boolean;
    reason?: string;
    denseFramesUsed?: number;
  };
}

export function renderImpressionMarkdown(
  impression: Impression,
  manifest: SessionManifest,
  opts: RenderImpressionOpts = {},
): string {
  const v = opts.validation;
  const validationFrontmatter = v
    ? `validation_triggered_by: [${v.triggeredBy.map((s) => JSON.stringify(s)).join(", ")}]
validation_revised: ${v.revised}${v.reason ? `\nvalidation_reason: ${JSON.stringify(v.reason)}` : ""}${v.denseFramesUsed !== undefined ? `\nvalidation_frames: ${v.denseFramesUsed}` : ""}\n`
    : "";
  return `---
url: ${impression.url}
generated_at: ${impression.generatedAt}
model: ${impression.model}
dwell_duration_seconds: ${(manifest.durationMs / 1000).toFixed(1)}
video: ${manifest.videoPath}
${validationFrontmatter}---

# ${new URL(impression.url).host}

> ${impression.oneSentenceVerdict}

## First five seconds

${impression.firstFiveSeconds}

## After exploration

${impression.afterExploration}

## Settling

${impression.settling}
`;
}
