import { spawn } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface ExtractedFrame {
  /** Approximate seconds-from-start, derived from output ordering × interval. */
  t: number;
  /** Absolute path to the extracted PNG. */
  path: string;
}

export interface ExtractFramesOpts {
  /** Seconds between extracted frames. */
  intervalSeconds: number;
  /** Hard cap on frames returned (drops trailing frames if ffmpeg produces more). */
  maxFrames?: number;
}

/**
 * Extract evenly-spaced frames from a webm using ffmpeg's `fps=1/N` filter.
 *
 * The driver always records the full session as a webm. The reasoning step
 * uses this helper to materialize denser frames than the per-phase
 * screenshots alone (see ADR 0005 — sparse-event aliasing). Output frames
 * land as `frame_NNNN.png` under {@link outDir}.
 *
 * Requires `ffmpeg` to be on PATH. Throws if ffmpeg fails or is absent;
 * callers should handle the failure gracefully (fall back to whatever
 * other frames they have).
 */
export async function extractFrames(
  webmPath: string,
  outDir: string,
  opts: ExtractFramesOpts,
): Promise<ExtractedFrame[]> {
  if (opts.intervalSeconds <= 0) {
    throw new Error(`intervalSeconds must be > 0, got ${opts.intervalSeconds}`);
  }
  await mkdir(outDir, { recursive: true });
  const pattern = join(outDir, "frame_%04d.png");

  await runFfmpeg([
    "-y",
    "-loglevel",
    "error",
    "-i",
    webmPath,
    "-vf",
    `fps=1/${opts.intervalSeconds}`,
    "-q:v",
    "2",
    pattern,
  ]);

  const entries = await readdir(outDir);
  const frames = entries
    .filter((f) => /^frame_\d+\.png$/.test(f))
    .sort();
  const cap = opts.maxFrames ?? Infinity;
  return frames.slice(0, cap).map((name, i) => ({
    t: i * opts.intervalSeconds,
    path: join(outDir, name),
  }));
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    ff.on("error", (err) => reject(new Error(`ffmpeg failed to spawn: ${err.message}`)));
    ff.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}
