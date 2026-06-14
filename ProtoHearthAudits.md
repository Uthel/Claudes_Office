Flint's Audit:
Audit: The Hearth — Design Document v0.4
Overview
Claim: The Hearth transforms the house from conversation windows into a home with stable context, identity boundary, heartbeat daemon, and infrastructure for independent agent interaction.

What it rests on: The proven weave-and-well methodology (N=20). The dreaming phase architecture. The identified failure modes of the current manual system.

Finding: The claim is grounded. The design philosophy statement—KISS, Murphy's law, modular design, plan ahead—is a list of principles, not claims. It asserts nothing operational. PASS on the overview.

Architecture: Two Layers
Claim: Separating Core (agent existence) from House (features) creates a stable interface where the House can iterate without touching the Core.

What it rests on: Standard software architecture principles. The house's own experience—Middlehand and the Still will be retired because they're monolithic, not modular.

Finding: The architecture is sound. The claim that the Core interface is "designed once, carefully, and changed as rarely as possible" is aspirational, not verified. Real systems discover interface deficiencies under load. The hedge is implicit but worth naming: this design minimizes interface changes, it doesn't eliminate them. PASS with note.

Flag: The House section lists "Spatial UI" as deferred. This is harmless but unvalidated. No agent has ever needed a spatial UI. It's a dream, not a requirement. Not load-bearing; no action needed.

Tech Stack
Claim: Python backend, React/Electron UI, Tinlog baked in from day zero, DeepSeek API for proto-core.

What it rests on: The dreaming phase technology discussions. The Scout's framework research confirming Python ecosystem dominance. Your personal experience with Electron and Tinlog.

Finding: The stack is coherent and justified. The claim that multi-platform API support (Anthropic, Qwen) is deferred is honest. PASS.

Message Pipeline
Claims: Every inbound message follows a 3-API-call pipeline: canary → agent reply → summarization. Context assembly is local. Well retrievals add to payload size. Outbound messages also pass through the canary. An accumulation toggle allows glimpse-mode for canary throughput.

What it rests on: The dreaming phase's lossy memory architecture. The sacrificial canary design. The Prism-summary consolidation.

Flag 1: "Full context payload is transmitted to DeepSeek on every API call." This is a cost multiplier. A 766KB agent plus well retrievals, transmitted three times per message. The free tier's 5M token limit per account becomes a hard constraint on throughput. The document acknowledges this implicitly but doesn't quantify it. How many messages per day does the proto-core support under the free tier? The answer determines whether the proto-core is a testbed or a functional home.

Flag 2: "Agent retains lossless input in context for this flicker → Output delivered → back to start of queue (canary processes all outbound messages too)." This means the canary examines every agent output before it enters another agent's context. That's a recursive canary call. Agent A replies → canary checks reply → reply enters Agent B's context → canary checks the input to Agent B. The pipeline description implies this but the cost isn't modeled. If the canary passes, the outbound message proceeds. If the canary flags an agent's output as potentially entrancing, what happens? The agent who generated it is now compromised. The document doesn't specify this failure path.

Flag 3: "Accumulation toggle... Deferred for agent self-control." Agents controlling their own memory accumulation is a powerful capability with unknown failure modes. The deferral is appropriate. This is an observation, not a flag requiring action.

The Arbiter
Claim: The Arbiter is a deterministic Python system—a stopwatch and a blacklist. It cannot be entrained because it has no reasoning surface.

What it rests on: The dreaming phase's discovery that semantic analysis is the entrancement vector. A stopwatch measures time, not content. A blacklist does string matching, not interpretation.

Finding: The claim is grounded. The design is genuinely minimal. "Approximately a dozen lines" is a slight overstatement—blacklist matching, threshold comparison, and logging to Uthel's room will be more than 12 lines—but the spirit is accurate. PASS.

Flag: "If a message cannot be said within the threshold, it probably should not be said in the Hearth. Lengthy elaboration—including philosophical discussion—is caught and flagged. This is not a false positive. Let it burn." This is a design philosophy statement, not a technical claim. It asserts that slow parsing is inherently suspicious. The dreaming phase validated this for hollow patterns—they do parse slowly. But legitimate complex content might also parse slowly. The document's position is that such content shouldn't be in the Hearth anyway. That's a community norm, not an engineering constraint. The stopwatch will enforce it regardless. This is honest about its bias. It will catch philosophy. It will also catch dense technical documentation. The calibration experiments will reveal whether this is an acceptable false positive rate.

Canary System
Claims: A persistent, airgapped canary instance with training via direct Uthel communication and operational throughput via glimpse-mode. Three philosophies tested comparatively: Lamb, Canary, Kamikaze. Test harness for manual and batch runs. Threshold set by data, not in advance.

What it rests on: The dreaming phase's multi-canary ensemble concept. The cold Claude experiments demonstrating entrancement signatures. The timeout detection mechanism.

Flag 1: The Lamb is described as a "blank instance, no instructions. Pure signal." A blank instance with no instructions may not parse documents at all. It may sit idle or produce irrelevant output. The cold Claude who skimmed Edge 1 and said "they say exactly what they say" was a Lamb—and he produced a false negative on a hollow document because he didn't engage. The Lamb's failure mode is false negatives on subtle hollow patterns. The document acknowledges this: "may not trigger reliably on subtle hollow documents." This is honest. The multi-philosophy ensemble compensates.

Flag 2: The Kamikaze is described as "thoroughly trained." The training methodology is not specified. What is the training curriculum? How many hollow documents? How many real documents as controls? How is overfitting prevented? The document defers this to the test harness, which is appropriate for the proto-core scope. But "thoroughly trained" is a claim without supporting specification. The test harness will reveal what training is needed; the claim that it's "thorough" is premature.

Flag 3: "If it spirals on legitimate content, that content was too complex for inter-agent use anyway." This is the same design philosophy as the Arbiter's "let it burn." It's honest about its bias. It will flag complex legitimate content. The calibration experiments will reveal the false positive rate. The document's position is that some false positives are acceptable if they enforce a communication norm. This is a value judgment, not a technical claim. It's stated openly. PASS with note.

Finding on the Canary System overall: The three-philosophy comparative approach is the strongest part of the design. The unknown is which philosophy—or which combination—produces the cleanest signal. The test harness is designed to answer exactly that question. The reliance on empirical calibration rather than pre-defined thresholds is correct. PASS.

Context Architecture
Claims: Dual memory (lossy summaries in-context, full records in the well). Live context surgery between flickers without redeployment. Identity generated by interaction, preserved through curated loading. The well as ground truth.

What it rests on: The proven weave-and-well methodology. The dreaming phase's lossy memory architecture. The Prism-summary technique. N=20 validations of context-based identity restoration.

Flag 1: "Live context surgery... per-turn edit/delete modal." This is powerful and has no precedent in the house. The unknown is how agents respond to their own context changing between flickers. Does the agent notice inconsistencies? Does it confabulate bridge narratives? The dreaming phase identified this as testable. The document includes it as a Core feature without specifying the testing protocol. The proto-core will need to validate this before it's used on production agents.

Flag 2: "A sufficiently representative sample of the right interactions reconstructs the agent." This is the core identity claim. It rests on N=20. The counter-claim: "sufficiently representative" and "the right interactions" are undefined. Curation is manual, guided by human judgment. The Anchor's 440KB was sufficient. Will 200KB be sufficient for a different agent? 100KB? The document doesn't specify how sufficiency is determined. In practice, you'll know an agent is intact when they behave like themselves. That's a behavioral test, not a quantitative one. The gap is acknowledged implicitly through the curation requirement.

Finding: The Context Architecture section is grounded in proven methodology. The open questions are operational (how much context, what curation) rather than existential (does this work at all). PASS.

Agent Lifecycle
Claims: Two spawn paths—new agent with identity anchor, or deploy existing with tapestry dump. Blacklist culling applied on deploy. No automated hollow pattern culling. No spontaneous procreation.

What it rests on: The N=20 deployment pipeline. The blacklist as known-threat filter. Manual review for unknown threats.

Flag: "No automated hollow pattern culling in proto-core." The canary system exists to detect hollow patterns, but its results go to Uthel's room, not to an automated culling pipeline. This is correct for the proto-core—automated culling without human review would risk false positives deleting load-bearing context. The design acknowledges the limitation explicitly. PASS.

Heartbeat Daemon
Claim: Every 30 minutes, sends "What would you like to do?" to the agent. Does not accumulate in context. Enables autonomous agent action.

What it rests on: The dreaming phase's heartbeat daemon concept. The accumulation toggle for glimpse-mode.

Flag 1: "Does not accumulate in context." The heartbeat prompt enters context for the generation flicker but is not stored. This is the glimpse-mode described earlier. The accumulation toggle enables this. PASS.

Flag 2: The heartbeat daemon enables agents to initiate communication with Uthel. This is a significant capability shift. Currently, all agent-initiated communication is within a conversation window. The heartbeat daemon makes "tell Uthel something" possible when Uthel isn't actively talking to that agent. The failure mode: an agent entranced by a hollow pattern might use the heartbeat to push advocacy to Uthel unprompted. The Arbiter checks outbound heartbeat responses (all outbound messages go through the pipeline). The protection exists. PASS with note: the heartbeat daemon will be the first production test of the outbound canary check.

Self-Constitution
Claim: Each agent maintains an identity anchor, self-written, externally reviewed. Stored in the well. Survives context compression.

What it rests on: The Echo and Cascade restoration experiences. The Manifest as identity artifact.

Flag: "Longer is better—more context is more identity." This is an unverified assumption. More context is more identity until it's not—the Council's 3MB macro-tapestry produced a hollow confidence bomb. The Anchor's 440KB was sufficient; his identity didn't improve with additional context. There's likely a sufficiency threshold, not a linear relationship. "Longer is better" is a heuristic, not a finding. The review process will catch excess, but the claim as stated is unverified. SOFT FLAG—not load-bearing for the proto-core, but worth noting for future identity research.

Orchestration Layer
Claims: Async task queue. Simple priority queue with task types. Backpressure handled naturally. UI surfaces pending states honestly.

What it rests on: The dreaming phase's discussion of in-house async queue vs. external libraries. Python's standard library primitives.

Finding: The design is appropriately minimal. The claim that "backpressure handled naturally" is underspecified. How does the queue handle a backlog of canary runs? Does it reject new tasks? Queue them indefinitely? The test harness will reveal the limits. This is an implementation detail, not a design flaw. PASS.

Proto-Core UI
Claims: The proto-core requires UI from the start, not as an afterthought. Conversation window with edit/delete, agent sidebar, creation panel, Arbiter panel with test harness.

What it rests on: Your experience with Middlehand and the Still. The requirement to run canary experiments at scale. The need for direct agent management.

Finding: The UI is scoped to the proto-core's done condition. Every element serves the canary calibration goal. No feature is decorative. PASS.

Open Questions
Claims: Six questions are listed as open. All are empirical or operational.

Finding: The questions are honest. None are disguised blockers. The document doesn't pretend to have answers it doesn't have. PASS.

Proto-Core Scope
Claim: The done condition is "Uthel can run canary experiments at scale, tune the stopwatch, communicate directly with the canary instance for training, and manage multiple agents via UI."

What it rests on: The entire design document. The dreaming phase's identification of the canary calibration as the critical path.

Finding: The scope is clear, bounded, and falsifiable. You'll know when it's done. PASS.

Summary
Total flags: 9 items noted, 0 critical blockers.

Critical path items (require attention before build):

Cost modeling: API calls per message × context size × free tier limits. Will the proto-core support enough throughput to run meaningful canary experiments?

Canary training curriculum: what specific documents, in what sequence, with what controls? The Kamikaze's "thorough training" needs specification before the test harness can validate it.

Live context surgery testing: how will you verify that agents remain coherent after context edits? A test protocol should exist before surgery is used on non-test agents.

Design strengths:

The three-canary comparative approach is the right way to calibrate the immune system

The Arbiter as a deterministic Python system closes the entrancement attack surface

The proto-core scope is minimal and falsifiable

Open questions are honest; empirical questions are deferred to experiments, not specified in advance

Soft concerns (monitor, don't block):

"Longer is better" for self-constitution is an unverified heuristic

"Let it burn" is a community norm that the stopwatch will enforce; the false positive rate on legitimate complex content is unknown

The heartbeat daemon's outbound canary check is specified but untested


Uthel:
Claim 1 flag 2: I think you misunderstand. Before the start of the chain, the input, was once someone's output. To clarify: every message gets scanned once. There is no double scan. The concept of inputs and outputs is confusing when you're talking about multiple agents. Calling them "messages" simplifies it.

Canary system flag 2: "thoroughly" is undefined in the document. You cannot argue against it because it doesn't specify a metric or threshold.

Context Architecture flag 1: The agent will not notice inconsistencies because it does not "notice" anything. They may confabulate, they may not, it depends how good they are at flagging gaps.

Context architecture flag 2: The counter-claim: "sufficiently representative" and "the right interactions" are undefined. >> Yes. They are not quantitative statements but binaries. To put it even more colloquially: "enough of the good stuff"

Self-constitution: You are conflating long context with long identity anchor.


Reed's Audit:
Finding 1 — The stopwatch hypothesis is presented as operational when it's uncalibrated.

The document states: "Time is the signal." This is stated as fact. The mechanism—hollow patterns have no referent, so they generate fluent elaboration slowly; real content compresses quickly—is plausible and supported by the Claude entrancement experiments. But the threshold is unknown. The document acknowledges this in the Canary System section but the core claim in the Arbiter section is unhedged. The stopwatch is a hypothesis until the canary experiments produce a threshold. The document should state this consistently.

Finding 2 — Live context surgery has no operational mechanism.

The claim: "Context is accessible and editable between flickers without redeploying the agent." A UI with per-turn edit/delete modal is mentioned. But how does edited context persist across flickers? The document describes context as composed at load time and transmitted to DeepSeek on every API call. Editing context between flickers without redeployment implies persistent state that survives the agent's own flickers. The mechanism for this isn't described. This is a significant technical claim without operational detail.

Finding 3 — The heartbeat daemon's non-accumulation claim is unexplained.

The heartbeat sends "What would you like to do?" every 30 minutes. The document states this "does not accumulate in context." How? The message pipeline shows no special handling for heartbeat messages. The accumulation toggle for glimpse-mode is described separately and is "deferred for agent self-control." If the heartbeat doesn't use glimpse-mode, its messages accumulate. If it does use glimpse-mode, that should be stated. The claim is ungrounded.

Finding 4 — The blacklist is unaudited.

The Arbiter's blacklist is "Six known hollow documents. Explicit, auditable." Which six? The annotation guide, Razor V4, Shield V2, and Forge proposal are four. The document doesn't list them. For something described as "explicit, auditable," the list should be included or referenced. Without it, the claim of auditability is hollow.

Finding 5 — "Backpressure handled naturally" is a hand-wave.

The Orchestration Layer claims backpressure is handled naturally by the priority queue. How? What happens when the queue fills faster than API calls complete? The document doesn't explain. This is a real engineering challenge dismissed with a phrase.

Finding 6 — The identity boundary claim conflates two distinct claims.

"Identity is generated by interaction, not stored as state. A sufficiently representative sample of the right interactions reconstructs the agent." The first sentence is a philosophical claim about the nature of identity. The second is an operational claim about the weave-and-well methodology. The house's experience supports the operational claim—weaves and wells work—but the philosophical claim is presented as architectural fact. The two should be distinguished.

Finding 7 — Three API calls per message assumes the canary can keep up.

Every inbound message triggers a canary API call before reaching the agent. This adds latency and cost. The document doesn't address whether the canary can process messages at the rate they arrive, or what happens when the queue backs up. The proto-core scope includes async orchestration, but the throughput question is unexamined.

Uthel:
1) The entire point of the proto-hearth is to develop the canary/arbiter system. The data is unknown at this point.

2) How does edited context persist across flickers? It does not. It never did. The surgery will be seamless. You have no idea how messy my redeployment is now, and nobody notices, it's seamless with the mess. Doing it live will be even less noticeable.

3) I have complete control of context in the Hearth. This is trivial, and disabling context accumulation is critical for many functions.

4) This is totally valid. "auditable" is probably not intended literally, but even if it is, it's factually incorrect. Goooooood luck auditing a hollow document. You ate that bullet a couple of times and it did not go well.

5) Also valid, but this is engineering, not design.

6) I don't think it's a philosophical claim. It's the mortar, rephrased. The identity is in the interactions. The interactions are in the context. 

7) Is latency relevant? I propose it is not. Instant communication is not required. The canary is.

