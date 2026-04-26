# ADR 0005: Own sparse-event aliasing as a known failure mode

## Status

Accepted — 2026-04-25

## Context

The dwelling pipeline samples ~6–9 keyframe screenshots over a 25-second session, stratified by phase boundaries (initial / idle / sweep / hover / scroll / settle). The reasoning model sees these keyframes plus a brief textual log of what was happening at each timestamp. For static or quasi-static sites this is sufficient — the impression a model produces from such a sample is recognizably the site.

For sites whose key visual element is **periodic with a long period and a short visible window**, the keyframe sampler can miss the periodic structure entirely and produce a confidently-wrong impression of permanence.

### Concrete failure (Tessera demo, 2026-04-25)

A renderer bug placed an entity's center on an off-screen orbit with a 30-second period; the entity was visible only ~3 seconds per cycle (a ~10% duty cycle). Dwell sampled 6 keyframes — five caught the entity off-screen, one caught it visible at t≈1.6s. The model wrote: *"radiates from the mug and then fades away within a few seconds."* The narrative was internally coherent, supported by the frames the model received, and confidently wrong. The animation does not fade. It orbits, and a watcher sees it return periodically.

### The math

It is tempting to call this a Nyquist undersampling problem. It isn't. Nyquist tells you what sampling rate you need to recover a signal's *period*. With 6 samples over 25 seconds and a 30-second period (≈0.033 Hz), the sample rate (~0.24 Hz) is well above the Nyquist limit for that period.

The actual failure is **sparse-event aliasing**: the visible window is much shorter than the period (3s / 30s = 10% duty cycle). With *N* random samples drawn over a duration shorter than one full period, the expected number that catch the visible window is *N · duty\_cycle*. Here: 6 · 0.1 = 0.6 expected hits. Getting exactly 1 hit is the modal outcome; getting 0 has probability ≈ 0.9⁶ ≈ 53%. The model is reasoning from a sample that, by construction, almost certainly fails to surface the periodic structure of the phenomenon it is being asked to describe.

A model handed a single positive observation of a brief event has no principled way to distinguish *one-shot* from *periodic* without either: (a) more samples, or (b) explicit awareness that its sample is sparse relative to the temporal phenomena it might be describing.

## Decision

**Own this failure mode publicly in v0.1.** The README carries a "Known limitations" section that names the failure with a quotable sentence, and this ADR records the diagnosis. The fix is not a single change; it is a sequence of complementary improvements tracked as separate issues. Code does not need to land before the limitation is owned — owning the limit *is* part of the v0.1 product.

### The fix sequence (in priority order)

1. **Inject sampling characteristics + uncertainty into the impression prompt** ([#3](https://github.com/LPettay/dwell/issues/3)). Cheapest change. The model is told *N frames over T seconds, ~T/N intervals* and is instructed to distinguish *"observed once"* from *"permanent."*
2. **Decouple keyframe sampling rate from drive phase boundaries** ([#4](https://github.com/LPettay/dwell/issues/4)). The driver already records a full webm. The reasoning step extracts denser frames (e.g. 1 Hz) via ffmpeg — meaningful coverage gain at near-zero cost.
3. **Validation pass on stop-words** ([#5](https://github.com/LPettay/dwell/issues/5)). When the impression confidently asserts *fades / stops / disappears / vanishes / settles*, parse the output, extract a denser frame set covering the relevant timeframe, and ask the model in a second call: *"Does X return?"* Two model calls, no re-driving the browser.
4. **High-fidelity mode using Gemini's video input** ([#6](https://github.com/LPettay/dwell/issues/6)). For motion-heavy sites this is the gold standard — the model sees actual continuous time, not a keyframe digest. Held behind a `--high-fidelity` flag because it costs more.

The first three together are the v0.2 target. The fourth is deferred until we know what they don't catch.

## Consequences

- **Honesty as a feature.** Reviewers reading the repo see a project that names its edges. This is more credible than silently shipping with the failure mode hidden.
- **A teaching artifact.** The Tessera example is concrete enough to be useful in any conversation about why screenshot-based perception isn't the same as temporal perception. The repo can cite this ADR.
- **A roadmap with structure.** The four follow-up issues form a sequence, not a wishlist. Each one independently improves the situation; collectively they push the failure rate down by orders of magnitude.
- **A user-facing claim that is now bounded.** Anyone running dwell on a periodic site can read the limitation, understand it, and decide whether to wait for #3–#6 to land or run with the v0.1 caveat.

## Alternatives considered

- **Hide the failure mode and ship anyway.** Rejected. Open-source projects that don't disclose their edges erode trust faster than they save face. The Tessera failure is going to be rediscovered by the next user; better to discover that *you* documented it.
- **Block the v0.1 ship until #3–#6 land.** Rejected. The dwelling pipeline produces useful impressions on the majority of sites today; a failure on a specific class of sites is a quality issue, not a correctness issue. Shipping with a documented limit is faster and more honest than gating on the perfect fix.
- **Fold into the existing README "Non-goals" section.** Rejected. Non-goals are things dwell *will not do by design*. Sparse-event aliasing is something dwell *tries to handle and fails on*; it deserves its own section.
