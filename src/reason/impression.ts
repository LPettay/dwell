import { GoogleGenAI, Type, type Part } from "@google/genai";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { SessionManifest, Impression } from "../types/session";

const SYSTEM_PROMPT = `You are an experiential reviewer of websites.

You are given a chronological sequence of screenshots from a 30-second "dwelling" session — an automated browser opened the URL, sat with it, swept the cursor across it, hovered a few interactive elements, and scrolled. Each screenshot is preceded by a timestamp + label describing what was happening at that moment.

Write a short impression that another human, who has actually been on the site, would read and recognize. Be specific about what you can see — typography, color, motion cues, layout density, what changed between frames when the cursor moved or the page scrolled. Do not speculate about implementation. Do not make claims about consciousness, qualia, or "experience" in any philosophical sense. Don't write marketing copy.`;

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
}

const DEFAULT_MODEL = "gemini-2.5-pro";

export async function buildImpression(opts: BuildImpressionOpts): Promise<Impression> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required (set in .env or env).");
  }
  const model = opts.model ?? process.env.DWELL_MODEL ?? DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  const screenshotEvents = opts.manifest.events.filter((e) => e.screenshotPath);
  if (screenshotEvents.length === 0) {
    throw new Error("No screenshots in session — nothing for the model to see.");
  }

  const MAX_FRAMES = 12;
  const sampled = sampleEvenly(screenshotEvents, MAX_FRAMES);

  const parts: Part[] = [
    {
      text: `URL: ${opts.manifest.url}\nDwell duration: ${(opts.manifest.durationMs / 1000).toFixed(1)}s\nFrames: ${sampled.length}\n\nThe screenshots below are in chronological order. Each is preceded by a timestamp + label.`,
    },
  ];
  for (const event of sampled) {
    parts.push({
      text: `\n[t=${(event.t / 1000).toFixed(1)}s · ${event.phase} · ${event.action}${event.note ? ` — ${event.note}` : ""}]`,
    });
    const bytes = await readFile(event.screenshotPath!);
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

export function renderImpressionMarkdown(impression: Impression, manifest: SessionManifest): string {
  return `---
url: ${impression.url}
generated_at: ${impression.generatedAt}
model: ${impression.model}
dwell_duration_seconds: ${(manifest.durationMs / 1000).toFixed(1)}
video: ${manifest.videoPath}
---

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
