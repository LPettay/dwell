# ADR 0006: The experience unit — scoped multi-URL dwelling

## Status

Proposed

## Context

The v0.1 scope firewall in [`AGENTS.md`](../../AGENTS.md#anti-scope-creep-firewall) lists "multi-page crawling beyond what dwelling on a single URL implies" as out of scope. That line was right for v0.1: it kept the project from sliding into being a scraper or a task agent, and it forced the dwelling choreography to focus on a single page deeply rather than many pages shallowly.

A real use case has now arrived that the single-URL ceiling does not handle well. The artist-agent use case ([#27](https://github.com/LPettay/dwell/issues/27)) wants Dwell to experience a YouTube channel — `youtube.com/@CHRBRG` — the way a person does: scroll the video grid, hover thumbnails until the auto-preview triggers, click into one or two videos, watch a short segment, return. The thing being experienced is *the channel*, not any one of those URLs in isolation. A single-URL run on the `/videos` tab would miss the hover-preview behavior; a single-URL run on one video would miss the grid energy. Neither is what a human would call "dwelling on the channel."

The same shape recurs elsewhere. A marketing site with `/`, `/about`, `/pricing` is one product. An artist's portfolio with `/work`, `/work/piece-a`, `/work/piece-b` is one body of work. In each case there is a *thing* with internal structure, and the unit a person would name when asked "what did you look at?" is the thing, not any single URL.

The question [#30](https://github.com/LPettay/dwell/issues/30) puts on the table is whether allowing this — multiple URLs within one declared scope — violates the spirit of Dwell or extends it. This ADR resolves only that question. It does not approve any specific multi-URL driver; each one (#27, #28, #29) still has to argue its own case.

## Decision

Introduce the concept of an **experience unit** as the explicit scope of one dwell session.

The experience unit is the upper bound of what a session is allowed to traverse. It is declared by the driver in code, not inferred at runtime and not configured by the end user. It is typed (a structured value the session driver can check), not a magic string the driver hopes to compare against.

The default experience unit is **a single URL**. The current behavior. Drivers that don't opt in see no change — the v0.1 firewall continues to apply to them, because their declared unit *is* one URL.

A driver may opt in to a wider unit by declaring it. The proposed YouTube channel driver (#27) declares its unit as **one channel** — concretely: the canonical channel handle, e.g. `@CHRBRG`. Within that unit the session driver may follow links from the channel grid into individual videos belonging to that channel and back to the grid. Outside that unit — a link to a sponsor's site, a suggested video from a different channel, the user's home feed, an embedded tweet — ends the session. The boundary is enforced by the session driver, not trusted to the choreography.

The session manifest records the declared unit alongside the URLs visited, so a reviewer reading an impression later can see what the session was allowed to do, not just what it did.

## Argument for

Dwelling is about experiencing one *thing*. A YouTube channel is one thing — the same way a marketing site with multiple pages is one thing, the same way an artist's portfolio site is one thing. The unit-of-experience is what matters. The single-URL ceiling was a useful proxy for "one thing" in v0.1 because most subjects we tested against (`fireside.technology`, single landing pages) happened to fit in one URL. The proxy was never the principle.

The principle is: **one session experiences one declared subject, end to end, and stops.** A session that wanders from a YouTube channel into the user's home feed has stopped experiencing the channel; the right thing for the session driver to do is end, not follow. That's the same firewall as v0.1 — it just lives at a different boundary.

This also matches how the recording-then-reasoning architecture ([ADR 0003](./0003-record-then-reason.md)) already thinks about scope. The recording is a temporal artifact of one experience. If the experience is "browsing this channel for thirty seconds," the recording should cover that, not arbitrarily clip at the first navigation.

## Argument against

Once "experience unit" exists as a concept, its edges are fuzzy in a way the single-URL ceiling was not. "All of an artist's body of work across YouTube and Bandcamp and their personal site" is a coherent unit of experience to a human, but enforcing it as a typed boundary in a session driver is messy — it crosses platforms, crosses authentication boundaries, and at some point looks indistinguishable from a focused scrape. "Everything tagged `#design` on this site" is similarly defensible and similarly slippery.

The v0.1 firewall was clear: one URL, one session. A reviewer could check it in seconds. An experience-unit firewall requires the reviewer to read the unit declaration, understand its boundary semantics, and trust that the session driver enforces the boundary correctly. That's more surface area for a contributor (or an AI agent) to argue around.

The mitigation is procedural, not technical: every multi-URL driver gets its own ADR, its unit declaration is reviewed in that ADR, and a driver whose unit is "the entire web minus these excluded patterns" fails review at the ADR stage, not at the code stage.

## Constraints if accepted

- Each driver that opts in to a wider experience unit declares the unit in code as a typed value (e.g. a discriminated-union variant, not a free-form string). The session driver pattern-matches on the unit to decide whether a navigation is in-bounds.
- The session driver is the enforcement point. Leaving the unit ends the session and writes out whatever was recorded up to that point. The driver does not try to "follow" or "recover" — out is out.
- The default experience unit remains a single URL. Drivers that don't declare a wider unit get the v0.1 behavior unchanged.
- Each new wider-unit driver requires its own ADR before implementation, the same way #27 required this one. The ADR documents the unit's boundary semantics, the rationale for that boundary, and the failure mode if the boundary is wrong.
- The "Anti-scope-creep firewall" section in `AGENTS.md` is amended (when this ADR is accepted) to permit experience-unit-scoped multi-URL traversal *only* when an ADR-backed driver opts in. The default-out posture is preserved.
- This ADR does not itself approve [#27](https://github.com/LPettay/dwell/issues/27), [#28](https://github.com/LPettay/dwell/issues/28), or [#29](https://github.com/LPettay/dwell/issues/29). It resolves only the meta-question of whether multi-URL sessions can ever land. Each downstream driver makes its own case.

## Consequences

- Unblocks the YouTube channel driver work ([#27](https://github.com/LPettay/dwell/issues/27)) to begin its own ADR and implementation, once this one is accepted.
- Forces every future multi-URL driver through an ADR. The cost is real (one short markdown per driver) and is the point — a fuzzy boundary is acceptable only when each instance of it is reviewed deliberately.
- The single-URL firewall is replaced by an experience-unit firewall — same spirit, different shape. A reviewer reading the repo six months from now sees that "one session, one declared subject" is the through-line, and the v0.1 single-URL rule is recognizable as a special case of it.
- Adds one field to `SessionManifest` (the declared experience unit). This is a schema change and is small; the default value for v0.1-style runs is the single URL, so existing recordings remain readable.
- Increases the surface area an AI agent contributing to this repo has to reason about. A future agent proposing a new driver has to declare a unit and defend it, not just write the choreography. This ADR exists in part so that defense has a vocabulary.

## Alternatives considered

- **Keep the single-URL firewall; reject #27 as out of scope.** Honest and easy to enforce. Rejected because it conflates the v0.1 implementation choice with a principle. The artist-agent use case is exactly the kind of "experience this thing" use case Dwell exists for; refusing it because the thing happens to span URLs would be defining the project by an arbitrary technical boundary.
- **Allow per-driver custom navigation logic with no shared concept.** Each multi-URL driver invents its own boundary as code. Rejected — the result would be N drivers with N subtly different definitions of "in scope," no shared vocabulary in ADRs or `AGENTS.md`, and no consistent way for the session manifest to record what scope a recording was made under.
- **Allow open-ended same-domain crawling (anything on `youtube.com`).** Simple to implement; deeply wrong. The user's YouTube home feed is on the same domain as a channel and is a different experience. A same-domain rule would let a session drift from "this channel" into "YouTube generally" without crossing any boundary the driver could detect.
- **Defer the question; ship #27 as a one-off exception.** Rejected. The same shape will recur ([#28](https://github.com/LPettay/dwell/issues/28), [#29](https://github.com/LPettay/dwell/issues/29) and beyond). Resolving it once, with vocabulary, is cheaper than relitigating it per driver.
