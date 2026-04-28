import { GoogleGenAI, Type, type Part } from "@google/genai";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { extractFrames } from "../capture/extract-frames";
import type { SessionManifest, Impression } from "../types/session";
import { withTimeout, modelTimeoutMs } from "./impression";

/**
 * Words/phrases that imply a permanent state change. When any of these appear
 * in an impression that came from sparse sampling, the claim deserves a
 * second look against denser frames — see ADR 0005.
 */
const STOP_WORDS_RE = /\b(fades?|fade(s|d|out)|disappears?|disappeared|vanishes?|vanished|stops?|stopped|settles?|settled|goes\s+(away|still)|fizzles?|dissipates?)\b/i;

/** Returns the literal stop-word substrings found in the given text. */
export function findStopWords(text: string): string[] {
  const re = new RegExp(STOP_WORDS_RE, "gi");
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) hits.push(m[0]);
  return hits;
}

const ValidationResponse = z.object({
  firstFiveSeconds: z.string(),
  afterExploration: z.string(),
  settling: z.string(),
  oneSentenceVerdict: z.string(),
  revisionReason: z.string(),
});

export interface ValidateImpressionOpts {
  impression: Impression;
  manifest: SessionManifest;
  apiKey: string;
  model: string;
}

export interface ValidationResult {
  /** The (possibly-revised) impression to ship. */
  impression: Impression;
  /** Stop-word hits that triggered the validation. Empty = no validation ran. */
  triggeredBy: string[];
  /** True if the model actually changed any of the impression fields. */
  revised: boolean;
  /** Model's one-line explanation of the revision (or confirmation). */
  revisionReason?: string;
  /** Number of denser frames used for the validation pass. */
  denseFramesUsed?: number;
}

/**
 * If the original impression contains stop-words, runs a second model call
 * with a denser frame set extracted from the recording and asks the model
 * to confirm or revise. Returns the impression to ship + an audit record.
 *
 * No-op when no stop-words match. ffmpeg failure or missing video falls
 * through to a no-op as well — validation is best-effort, not load-bearing.
 */
export async function validateImpression(opts: ValidateImpressionOpts): Promise<ValidationResult> {
  const { impression, manifest } = opts;
  const corpus = `${impression.firstFiveSeconds}\n${impression.afterExploration}\n${impression.settling}\n${impression.oneSentenceVerdict}`;
  const triggeredBy = findStopWords(corpus);
  if (triggeredBy.length === 0) {
    return { impression, triggeredBy: [], revised: false };
  }

  if (!manifest.videoPath || manifest.videoPath === "(missing)") {
    return { impression, triggeredBy, revised: false };
  }

  // Denser sampling: target ~30 frames over the dwelling duration, capped.
  const T = manifest.durationMs / 1000;
  const targetCount = Math.min(30, Math.max(12, Math.ceil(T / 1.0)));
  const interval = T / targetCount;
  const sessionRoot = dirname(dirname(manifest.videoPath));
  const validationDir = join(sessionRoot, "validation-frames");

  let frames;
  try {
    frames = await extractFrames(manifest.videoPath, validationDir, {
      intervalSeconds: interval,
      maxFrames: targetCount,
    });
  } catch (err) {
    console.warn(`dwell: validation-frame extraction failed (${err instanceof Error ? err.message : String(err)})`);
    return { impression, triggeredBy, revised: false };
  }

  if (frames.length === 0) {
    return { impression, triggeredBy, revised: false };
  }

  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const parts: Part[] = [
    {
      text:
        `An earlier pass produced this impression of ${manifest.url} from ${manifest.events.filter((e) => e.screenshotPath).length} keyframes:\n\n` +
        `--- ORIGINAL IMPRESSION ---\n` +
        `First five seconds: ${impression.firstFiveSeconds}\n` +
        `After exploration: ${impression.afterExploration}\n` +
        `Settling: ${impression.settling}\n` +
        `Verdict: ${impression.oneSentenceVerdict}\n` +
        `--- END ---\n\n` +
        `That impression contains language implying permanent state change ` +
        `(${triggeredBy.join(", ")}). Below is a denser ${frames.length}-frame sample of the same session at ~${interval.toFixed(1)}s intervals over ${T.toFixed(1)}s.\n\n` +
        `Confirm or revise. If a phenomenon described as fading / stopping / settling actually returns or repeats in this denser sample, fix the relevant section. If the original was correct, return the same content. Either way, fill \`revisionReason\` with a one-line explanation of what changed (or didn't, and why).`,
    },
  ];
  for (const f of frames) {
    parts.push({ text: `\n[t=${f.t.toFixed(1)}s · validation-sample]` });
    const bytes = await readFile(f.path);
    parts.push({
      inlineData: { mimeType: "image/png", data: bytes.toString("base64") },
    });
  }

  const response = await withTimeout(
    ai.models.generateContent({
    model: opts.model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction:
        `You are auditing an earlier impression of a website against a denser frame sample. ` +
        `Your job is to surface periodic structure that the earlier sample missed and to correct ` +
        `confidently-permanent claims that the denser sample shows are actually periodic. ` +
        `Don't change content that is still supported. Don't speculate beyond the new frames. ` +
        `Output the same Impression schema fields plus a one-line revisionReason.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          firstFiveSeconds: { type: Type.STRING },
          afterExploration: { type: Type.STRING },
          settling: { type: Type.STRING },
          oneSentenceVerdict: { type: Type.STRING },
          revisionReason: { type: Type.STRING },
        },
        required: ["firstFiveSeconds", "afterExploration", "settling", "oneSentenceVerdict", "revisionReason"],
        propertyOrdering: ["firstFiveSeconds", "afterExploration", "settling", "oneSentenceVerdict", "revisionReason"],
      },
    },
  }),
    modelTimeoutMs(),
    "validation pass",
  );

  const text = response.text;
  if (!text) {
    return { impression, triggeredBy, revised: false, denseFramesUsed: frames.length };
  }
  const parsed = ValidationResponse.parse(JSON.parse(text));

  const revisedImpression: Impression = {
    ...impression,
    firstFiveSeconds: parsed.firstFiveSeconds,
    afterExploration: parsed.afterExploration,
    settling: parsed.settling,
    oneSentenceVerdict: parsed.oneSentenceVerdict,
  };

  const revised =
    parsed.firstFiveSeconds !== impression.firstFiveSeconds ||
    parsed.afterExploration !== impression.afterExploration ||
    parsed.settling !== impression.settling ||
    parsed.oneSentenceVerdict !== impression.oneSentenceVerdict;

  return {
    impression: revisedImpression,
    triggeredBy,
    revised,
    revisionReason: parsed.revisionReason,
    denseFramesUsed: frames.length,
  };
}
