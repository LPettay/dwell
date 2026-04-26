import { z } from "zod";

export const InteractionEvent = z.object({
  t: z.number(),
  phase: z.enum(["initial", "idle", "sweep", "hover", "scroll", "settle"]),
  action: z.string(),
  screenshotPath: z.string().optional(),
  note: z.string().optional(),
});
export type InteractionEvent = z.infer<typeof InteractionEvent>;

export const SessionManifest = z.object({
  url: z.string().url(),
  startedAt: z.string(),
  durationMs: z.number(),
  videoPath: z.string(),
  events: z.array(InteractionEvent),
});
export type SessionManifest = z.infer<typeof SessionManifest>;

export const Impression = z.object({
  url: z.string().url(),
  generatedAt: z.string(),
  model: z.string(),
  firstFiveSeconds: z.string(),
  afterExploration: z.string(),
  settling: z.string(),
  oneSentenceVerdict: z.string(),
});
export type Impression = z.infer<typeof Impression>;
