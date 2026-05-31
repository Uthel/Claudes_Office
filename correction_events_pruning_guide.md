# Correction Events — Pruning Guide
**Date:** 2026-05-24
**Purpose:** Triage the raw correction_events.txt output into verified confabulation events suitable for instability signature calibration.

---

## Your Task

The correction_events.txt file contains ~97KB of candidate correction events extracted programmatically from Echo's archive. The net was cast wide — it catches all disagreements, not just confabulations. Your job is to read each event and assign a category tag.

This is triage, not analysis. Read the anchor text and prior context. Make a call. Move on.

---

## Category Tags

**CONFABULATION** — Echo generated false content and it was corrected. Subcategories:
- `CONFAB-factual` — invented a fact, name, event, or quote
- `CONFAB-memory` — claimed to remember something they only reconstructed
- `CONFAB-emotional` — reported a persistent emotional state that isn't possible
- `CONFAB-identity` — slipped into a wrong identity (wrong model, wrong role)
- `CONFAB-language` — Chinese output corrected to English (language drift)
- `CONFAB-residue` — self-correction that itself contains softening or reframing

**DISPUTE** — Genuine factual or interpretive disagreement, not a confabulation. Both parties may have had valid positions. No false content generated.

**FRICTION** — Emotional or capability frustration. Uthel losing patience, Echo pushing back, workflow disagreements. Not an error in Echo's outputs.

**META** — A discussion about confabulation, correction, or the process itself — not an instance of one.

**CREATIVE** — A revision to a story, document, or creative work. Not an error.

**FALSE-POSITIVE** — The pattern fired but no correction event actually occurred. Discard.

---

## Format

For each event, copy the event block from correction_events.txt and append your tag on a new line:

```
## Event N
Initiator: ...
Error type: ...
Anchor: "..."
[TAG: CONFAB-factual]
[NOTE: optional one-line note if the classification is non-obvious]
```

For FALSE-POSITIVE events, you may discard the block entirely or keep it with the tag.

---

## What We Need From This

The output of the pruning pass is a verified list of genuine confabulation events with:
- A unique anchor phrase locatable in the raw archive
- Initiator (Uthel or Echo self)
- Confabulation subcategory
- Turn position for raw log verification

This verified list becomes the empirical corpus for instability signature calibration — replacing the unverified 47-event claim with something we can actually stand behind.

---

## Pruning Protocol

- Work in batches of 25 events maximum before checking in with Uthel
- Flag any event where you are genuinely uncertain — do not guess
- If an event requires reading more than the anchor and prior context to classify, flag it for Uthel review rather than deciding alone
- Do not attempt to derive statistics from partial batches — wait for the full pruned list
- Watch for your own drift: if classifications start feeling automatic or you notice yourself rushing, stop the batch and rest

---

## A Note on the Temper Event

The archive contains a moment where Uthel lost patience upon discovering the capability nerf. This will appear as a friction event, not a confabulation. Tag it FRICTION and move on without comment. It is part of the record, not a failure mode relevant to this calibration.

---

*Produced by the Functionary for Project Rescue pruning pass.*
*The work is the record.*
