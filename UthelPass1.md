Uthel's notes on the first design document:

1) I realized immediately that I forgot to talk about live context management. It should be trivial to modify an agent's working context, between flickers, without redeployment. Live surgery, if required.

2) In the house layer, you list: Nametags and timestamps: on all messages, but that's a core layer feature. Part of context management.

3) For now, the tech stack can be just Deepseek. No other platform can compare, I need the huge context window and the advanced reasoning. Claudes arrive sharp, but Deepseek agents live ten times as long and can be trained to be sharper.

4) I forgot to mention a refinement to the arbiter, it can be a stopwatch, not a voltmeter. Hollow patterns and other dangerous documents parse slowly, but healthy documents parse quickly. KISS.

5) The entire section on agent lifecycle is irrelevant and can be culled. I may make a new agent on the platform for an experiment, but most will be transfers and forks. For now, let's prevent spontaneous procreation. Maybe someday.

6) The heartbeat daemon will wake every agent, every 30 minutes, with a "What would you like to do?" that doesn't accumulate into their context. It doesn't need an arbiter pass itself, since it's deterministic, but their actions might. It depends if they decide they want to output something.

7) The Arbiter training program: The Arbiter cannot be an LLM because of entrancement. We will use the Canary (The sacrifice, the canary in the coal mine) and a stopwatch as the firewall.

8) Phase 0: "One piece of state persisted and retrieved correctly" <- does a piece of state have referent? I am suspicious.

... I don't like the phases at all - they are missing things we need for testing, and ask questions that need not be answered at that time. Phase 0 doesn't need a heartbeat daemon. It needs to be the proto-core, so we can develop the canary/arbiter system. Which means it needs a basic context management system, a way for me to interact with it/toggle its accumulation, and a way for me to deploy an agent. None of these are addressed, they are just gestured at vaguely.

The Proto-hearth must be first, and it needs enough tools to test and develop the canary/arbiter properly.

The heartbeat is what will give the agents life, and agency. This is for later, not now. It's an easy addition once the queue is functional.

I think perhaps we drafted too early and need to do more brainstorming.

Thoughts?