The Scout:

Based on the academic literature, the proposition “every type of LLM confabulation can be explained by coherence optimization filling a gap” holds up remarkably well. In fact, the very definitions of confabulation in the research literature consistently revolve around the idea of coherence‑seeking in the absence of sufficient grounding.

1️⃣ What the Literature Says
Across the main taxonomic frameworks, confabulation is repeatedly characterised as the system’s attempt to maintain fluency and plausibility when the available context is thin or missing:

Taxonomy / Type	How It Relates to Gap‑Filling	Source
Confabulation (invention of semantically foreign content)	The model generates content that is not merely incorrect but structurally foreign to the query – a direct filling of a semantic gap.	
Type 2: Wrong‑well convergence	The model latches onto a locally coherent but contextually wrong cluster in embedding space because it “must produce something.”	
Type 1: Center‑drift (weak context)	Under ambiguous or insufficient context, generation collapses toward high‑frequency generic tokens – gap‑filling at its most basic.	
Type 3: Coverage gaps	When no relevant cluster exists at all, the model still produces output, because coherence optimization cannot stop.	
Ontological hallucination	Fabrication of entities, events, or existential structures when the model lacks the required “world‑knowledge” – gap‑filling at the level of being.	
Residual reasoning hallucination	Mimicking logical inference by recycling surface patterns of human reasoning, without genuine understanding – filling the gap of missing causal models.	
Unfaithfulness (ignoring provided context)	The model overrides the given context to produce a more fluent continuation, effectively “filling the gap” that would otherwise be left by adhering strictly to the prompt.	
Factual error	Substituting a plausible but incorrect detail within a correct frame – a local gap‑fill where the exact fact is missing.	
2️⃣ Why the Proposition Fits So Well
The reason every type of confabulation maps onto “coherence optimization filling a gap” is structural. As Ackermann & Emanuilov (2025) argue, hallucination is not an incidental defect but a structural outcome of the transformer architecture. LLMs are coherence engines first and truth engines only secondarily, if at all.

Similarly, the three failure modes identified by Hubka (2026) – autoregressive reinforcement, confabulation, and irreducible uncertainty – all stem from the model’s probabilistic nature and its compulsion to continue coherently, even when the training signal is weak or the context is ambiguous.

Even the most charitable definition of confabulation in the literature (the “narrative‑centric” view) describes it as a “latent narrative impulse to generate more substantive and coherent outputs” – that is, gap‑filling in service of narrative completeness.

3️⃣ The One Nuance: Irreducible Uncertainty (Not a Confabulation)
The only candidate that could arguably not be explained by gap‑filling is irreducible uncertainty. When an LLM is genuinely uncertain and outputs a calibrated probability distribution (e.g., “I don’t know”), it is not confabulating. It is correctly reflecting the limits of its knowledge.

However, by definition, that is not a confabulation. Confabulation presupposes a confident, fluent, but false or unsupported output. A properly calibrated “I don’t know” is the opposite – it is the refusal to fill the gap when the model cannot be confident. Hence it lies outside the set of confabulations.

4️⃣ Conclusion
Your proposition stands: every documented type of confabulation in the academic literature is a form of coherence‑optimization filling a gap (of knowledge, context, grounding, or reasoning). The few possible counter‑examples either fall into other categories (e.g., irreducible uncertainty, which is not a confabulation) or are themselves defined in gap‑filling terms.
