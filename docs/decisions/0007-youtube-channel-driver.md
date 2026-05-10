# ADR 0007: YouTube channel driver — the channel as experience unit

## Status

Proposed

## Context

[ADR 0006](./0006-experience-unit-multi-url.md) introduced the *experience unit* — a typed, driver-declared upper bound on what one dwell session may traverse — and committed that each new wider-unit driver argues its own case in its own ADR. This is that case, for [#27](https://github.com/LPettay/dwell/issues/27).

The artist-agent use case wants Dwell to experience a YouTube channel — `youtube.com/@CHRBRG` — the way a person browsing it casually would: scroll the video grid, let thumbnail hover-previews auto-play, click into one or two videos, watch a short segment, return. None of those individual URLs alone is the experience. A single-URL run on `/videos` captures the grid energy but not what any video feels like; a single-URL run on one video captures one piece in isolation. The thing a person would name when asked "what did you look at?" is *the channel*, and that is the unit this ADR proposes.

The downstream constraint that matters: hover-previews on the channel grid are a defining piece of YouTube's character. They are temporal, motion-driven, and invisible to a static screenshot — exactly the kind of response Dwell's record-then-reason architecture ([ADR 0003](./0003-record-then-reason.md)) exists to capture. A driver that only inspects single video pages misses the part of the experience most worth recording.

## Decision

Add a YouTube channel driver that declares its experience unit as **one channel**, identified by canonical handle.

**Unit declaration.** The driver declares a typed unit:

```ts
type ExperienceUnit =
  | { kind: "url"; url: string }                  // default; v0.1 behavior
  | { kind: "youtube-channel"; handle: string };  // this ADR
```

The handle is the canonical `@<name>` form (e.g. `@CHRBRG`). All channel-tab URLs (`/`, `/videos`, `/featured`, `/about`, `/streams`, `/community`) belonging to that handle resolve to the same unit. The `kind` discriminant is what the session driver pattern-matches against to pick a choreography and to enforce the boundary.

**Boundary, enforced at the navigation source — not at URL parsing.** The driver only navigates by following links *originating from the channel's own `/videos` grid*. That source is in-bounds by construction: the videos in that grid are the channel's videos. Navigations originating from anywhere else — the suggested-video sidebar inside a watch page, end-card overlays, links in a video description, the up-next auto-advance — are refused.

This sidesteps the harder problem of "is this destination URL still part of the channel" by making it irrelevant. The driver never needs to inspect a watch page to decide whether the watch page is in-bounds, because it only ever opens watch pages whose links it just clicked from the grid.

Concretely, in-bounds navigations:

- The channel's tab URLs under `youtube.com/@<handle>/...`.
- `youtube.com/watch?v=<id>` *only* when the click originated from the channel's own grid.
- A return to the grid (browser back, or explicit re-navigate to `/videos`).

Out-of-bounds (ends the session):

- Any navigation initiated by the page itself (auto-advance, redirect to a non-channel URL, region-block redirect to home, auth wall).
- Any link the choreography did not click (no following sidebars, end cards, descriptions, or comment links).
- Any explicit cross-channel link, even from the channel's own grid (a "featured channels" widget, a community-post embed of someone else's video).

Out is out: the session ends and writes the recording it has so far. The driver does not try to recover or reroute.

**Choreography, in principle.** Phase names and exact timings are implementation detail and are not pinned by this ADR. The principles are:

- The grid is the home base. Time on the grid (scrolling, lingering on thumbnails to trigger hover-preview clips) is the spine of the session.
- The driver enters at most a small bounded number of videos from the grid — default one — and watches a short segment, then returns. The bound is part of the unit declaration, not a runtime config the choreography can stretch.
- Returning to the grid is a navigation, not a recovery: it is initiated by the driver, not by clicking "back to channel" links inside a video page.
- All existing behaviors continue to apply: cookie-banner auto-dismiss, info-banner dismiss with overlay-geometry guard, dialog handler, headed Chromium only, the choreography-must-not-throw rule.

**Schema change.** This ADR is the first driver to land the `experienceUnit` field that [ADR 0006](./0006-experience-unit-multi-url.md) called for. `SessionManifest` gains:

```ts
experienceUnit: ExperienceUnit;
```

Existing single-URL runs synthesize `{ kind: "url", url }` from the existing `url` field. The field is required on new manifests; readers of v0.1 manifests that lack the field default to the URL form. No behavioral change for existing drivers.

## Argument for

The hover-preview behavior on the grid is the part of YouTube most worth recording, and it is unreachable from a single-URL run. ADR 0003 said the recording is the source of truth and the impression is the derived artifact; refusing the channel unit means refusing to record the artifact in the first place, which is a bigger compromise than the boundary cost of declaring a wider unit.

The grid-as-trusted-source rule keeps the boundary check cheap and obvious. A reviewer reading the driver does not need to understand a URL-classification heuristic; they need to see one rule: "we only click thumbnails on the channel's own grid; everything else is a session-end." That rule is short enough to explain in a sentence and short enough to enforce in code.

The bound on number-of-videos-entered is the part of this design that prevents drift. A driver that enters one video, watches ten seconds, and returns is dwelling on the channel. A driver that hops video → suggested → suggested → suggested has stopped dwelling on the channel and started dwelling on YouTube's recommender. The grid-source rule already forbids that pattern, but the per-session bound is a second guard.

## Argument against

YouTube's DOM is a moving target. Any driver that depends on identifying "the grid" or "a thumbnail link" relative to the channel's own URL space will need maintenance the moment Google ships a layout change. The mitigation is the existing convention from `src/drive/AGENTS.md`: interaction probing must not throw; flaky elements are skipped. Worst case the recording is a quiet scroll of a page whose thumbnails the driver could not identify — degraded, not crashed, and that's acceptable for a v0.1-spirited driver.

The "click originated from the grid" rule is enforced at the choreography level, not by a URL allowlist. That is structurally weaker than a typed boundary check on every navigation. A future contributor adding a "click into a suggested video" extension would not be stopped by a type system — they would be stopped by code review reading this ADR. That is a process boundary, not a technical one. The mitigation is the requirement that any wider behavior gets its own ADR; this is a known cost of the experience-unit model.

The unit declaration assumes channels are addressed by `@<handle>`. Legacy `youtube.com/channel/UC...` and `youtube.com/c/<name>` URLs exist. The driver normalizes those to a canonical handle before declaring the unit; if normalization fails, the run does not start. This is preferable to declaring a unit the driver can't reliably check.

## Constraints if accepted

- The driver lives at `src/drive/youtube-channel-session.ts` (new file). It does not modify the existing `src/drive/dwell-session.ts` choreography. Drivers compose; they do not multiplex.
- The CLI gains a way to invoke the channel driver — likely a flag (`--youtube-channel`) or auto-detection from a `youtube.com/@<handle>` URL. The exact UX is implementation detail and decided in the implementation PR.
- Authentication remains out of scope. Public channels only. Age-restricted videos that require sign-in are skipped (the watch phase silently no-ops and the session returns to the grid).
- Audio capture is **not** introduced by this ADR. [#12](https://github.com/LPettay/dwell/issues/12) is the right place for that and should land independently. Until #12 is resolved, the channel driver records what the existing pipeline records: video + screenshots + event log, no audio. The visual experience (grid, thumbnails, hover-previews, watch segment) is independently valuable.
- Shorts, livestreams, and the community / about tabs are **not** part of this ADR. The driver visits `/videos` only. Shorts in particular are a different idiom (vertical, swipe-driven, autoplay-first); they deserve their own driver and their own ADR if and when the use case arrives.
- "Multi-channel" sessions ("dwell on this creator's body of work across YouTube and Bandcamp and their site") are explicitly not introduced. ADR 0006 already excluded cross-platform units; this ADR does not relax that.
- The `experienceUnit` field on `SessionManifest` is required on new recordings. The Zod schema accepts manifests that lack it (synthesizes the URL form) so prior recordings remain readable.
- Failure modes are covered by the existing "choreography must not throw" rule. Channel-not-found, redirect-to-home, blocked-by-region, video-unavailable: the driver records what it has and ends. There is no recovery code path.

## Consequences

- A new driver lands. The existing single-URL driver is unaffected and remains the default.
- `SessionManifest` gains one field. The reasoning step (`src/reason/`) does not need to consume it for v0.1 impressions, but should pass it through for auditability — a reviewer reading an impression should be able to see what unit the recording was made under.
- The pattern of "experience unit per driver, declared in code, enforced at the navigation source" is now exemplified, not just described. Future driver ADRs (#28 attention-signal, #29 creative-impression are not driver ADRs; the next plausible candidate is a Shorts driver or a portfolio-site driver) have a concrete prior to copy.
- The hover-preview behavior, which the existing driver cannot record, becomes recordable. This is the qualitative win that motivated the use case.
- Maintenance cost rises. YouTube DOM churn will surface in this driver before anywhere else. The "skip on flaky" rule keeps that from breaking the test surface, but periodic recordings against a known channel are the only way to notice silent degradation.

## Alternatives considered

- **Same-domain allowlist (`youtube.com` is in-bounds, anything else ends the session).** Rejected in ADR 0006's alternatives and rejected again here. The user's home feed, Shorts, the algorithmic up-next stream, and an unrelated channel's videos are all on `youtube.com`. A same-domain rule would let the session drift from "this channel" into "YouTube generally" without crossing any boundary the driver could detect.
- **Resolve the uploader of every watch page after navigation; end the session on mismatch.** Cleaner than the source-rule in principle, but requires a runtime check on a YouTube DOM that changes, and creates a window during which the driver is on an out-of-bounds page before deciding to leave. The grid-source rule prevents that window from existing in the first place.
- **Bundle audio capture into this ADR.** Rejected. Audio capture (#12) is a cross-cutting concern with its own design questions (system audio vs. tab audio, ffmpeg pipeline, model input shape). Bundling it would couple two decisions and stall both. The visual channel experience is shippable without audio.
- **Treat the channel as N independent single-URL sessions and stitch the impressions.** Rejected. The grid energy and the hover-preview behavior live *between* the per-URL sessions, not inside any one of them. Stitching after the fact is exactly what the experience-unit concept exists to avoid.
