# Tinlog — Structured Evidential Logging for LLM-Assisted Development

## What Is Tinlog?

Tinlog is a development technique and naming convention for a specific kind of runtime
logging system designed to be read by an LLM agent rather than a human developer.

The name comes from "Tineyes" — the vision-enhanced allomancers in Brandon Sanderson's
Mistborn novels, who burn tin to perceive everything with heightened clarity. The Tinlog
is the LLM's tin — it lets the agent see exactly what happened inside a running program
without needing the developer to relay information.

The core idea: instead of using a debugger or print statements to understand what went
wrong, the program writes structured, assertion-based evidence to a file on disk. The LLM
reads that file, identifies failures, forms a hypothesis, edits the code, and repeats.
This closes the loop between "make a change" and "verify it worked" without human
interpretation in between.

---

## The Problem Tinlog Solves

Standard LLM-assisted development has a communication gap:

1. LLM edits code
2. Developer runs the program
3. Something doesn't work
4. Developer describes what happened to the LLM
5. LLM guesses at the cause

Step 4 is the bottleneck. The developer has to translate runtime behavior into language,
and that translation is lossy. Tinlog eliminates step 4 entirely — the program speaks
for itself.

---

## Core Principles

**Log for the LLM, not for humans.**
The log is not a trace for debugging in the traditional sense. Every line should answer
the question: "did this system behave correctly?" Values, transitions, and assertions —
not narrative prose.

**Log events and transitions, not continuous state.**
Do not log inside tight loops or every frame/tick. Log when something changes: a state
transition, a method call with meaningful parameters, a value being committed. A 50,000
line log from per-frame output defeats the purpose.

**Asserts carry pass/fail semantics.**
Every assert line ends in ✓ or ✗ FAIL. The LLM scans for ✗ to locate problems
instantly. Do not assert on rejection/fallback paths where the "wrong" value is
intentional — those are notes, not failures.

**Rejections are notes, not failures.**
If a system correctly rejects invalid input, log that as a neutral note. Only assert
when the system is expected to succeed.

**The log is cleared on every run.**
Each program start overwrites the log file with a fresh session header. This means the
log always reflects the most recent run — no stale data confusion.

**Errors are captured automatically by the Sentinel.**
The TinlogErrorSentinel hooks into runtime error systems (Unity's
Application.logMessageReceived, or browser window.onerror) and forwards all errors and
exceptions to the log automatically. The LLM never has to hunt through a separate engine
log file.

---

## File Structure

The log produces two files:

**dev_log.txt** — the main log, cleared on each run.
**tinlog_index.txt** — a sister file listing all sections logged this session.
Never cleared. Always reflects the current session's sections.

The LLM reads tinlog_index.txt first to know which sections exist, then jumps directly
to the relevant section in dev_log.txt rather than parsing the whole file.

### Log Format

```
=== RUN 14:32:01 ===

=== [SENTINEL] ===
[SENTINEL] TinlogErrorSentinel installed — monitoring runtime errors ✓

=== [SYSTEM_NAME] ===
[SYSTEM_NAME] methodName called: param=value
[SYSTEM_NAME] stateVariable: 42 (expected 42) ✓
[SYSTEM_NAME] goldAfterPurchase: 100 (expected 100) ✓
[SYSTEM_NAME] Transition → NewState ✓

=== [ANOTHER_SYSTEM] ===
[ANOTHER_SYSTEM] tileType: path (expected empty) ✗ FAIL (expected empty)
[ANOTHER_SYSTEM] ✗ ERROR: index out of range at row=15

=== [INDEX] ===
  - SENTINEL
  - SYSTEM_NAME
  - ANOTHER_SYSTEM
```

---

## What to Log (Checklist)

For every system, log:

- All significant method entries with their parameters
- All state transitions (from → to, what triggered it)
- All values that must be correct for the system to function — use Assert
- All rejection/fallback paths — use Note (not Assert)
- All network/RPC calls (sender, params, receiver)
- All spawn/instantiation events (what, where, by whom)
- All error conditions — use Error
- Key computed output values before they are used

Do NOT log:
- Inside per-frame/per-tick loops unless debugging a specific frame issue
- Redundant confirmation of things already confirmed elsewhere
- Implementation details that don't affect observable behavior

---

## The DevLog API

All methods share the same signature pattern: system name, label, value.
The system name groups related logs into a named section.

```
DevLog.Section("SYSTEM_NAME")
  — Open a named section. Call once per system per run.
  — Subsequent calls with the same name are ignored (idempotent).

DevLog.Log("SYSTEM_NAME", "label", value)
  — Informational. No pass/fail. Use for observed values.

DevLog.Assert("SYSTEM_NAME", "label", value, expected)
  — Compares value to expected. Appends ✓ or ✗ FAIL.
  — Only call when the value is required to be correct.

DevLog.Note("SYSTEM_NAME", "message")
  — Plain event or transition log. No value comparison.

DevLog.Error("SYSTEM_NAME", "message")
  — Unexpected failure. Always indicates something wrong.

DevLog.Toc()
  — Write the session index. Call at end of session / game over.
```

---

## TinlogErrorSentinel

A static class installed once at app startup. Requires no per-scene setup.
Hooks into runtime error systems and forwards all errors and warnings to the log
automatically under the [SENTINEL] section.

**Unity:** Uses `[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]`
to install before any scene loads, catching errors during initialization.
Listens to `Application.logMessageReceived`.
Captures: LogType.Error, LogType.Exception, LogType.Assert (as errors),
and LogType.Warning (as notes). Ignores LogType.Log to avoid engine noise.

**Web/JS:** Hooks `window.onerror`, `window.onunhandledrejection`,
and intercepts `console.error` / `console.warn`.
Installed as the very first line of the app entry point.

Both versions are stripped from production builds via compile-time guards
(`#if UNITY_EDITOR || DEVELOPMENT_BUILD` in Unity;
`import.meta.env.DEV` in Vite/TypeScript).

---

## The Debug Trigger Convention

To allow the LLM to test a specific system state without playing through all preceding
states, each testable system should have a Debug Trigger — a temporary, hardcoded input
that bypasses normal prerequisites and jumps directly to the state under test.

Every debug trigger must:
1. Be wrapped in a development-only guard so it cannot ship
2. Log its activation clearly: `DevLog.Note("SYSTEM", "DEBUG TRIGGER: F8 forced placement state")`
3. Include a TODO comment naming the real trigger it bypasses

Example (Unity):
```csharp
#if UNITY_EDITOR || DEVELOPMENT_BUILD
void Update()
{
    // TODO: REMOVE — real trigger is TurnManager.OnObjectPicked
    if (Input.GetKeyDown(KeyCode.F8))
    {
        DevLog.Note("PLACEMENT", "DEBUG TRIGGER: F8 forced placement state");
        ForcePlacementStateForTesting();
    }
}
#endif
```

A debug trigger does not constitute a complete test. The real trigger path must be
verified separately before the feature is considered done. The LLM should flag this
explicitly in its completion report.

---

## The Automated Iteration Loop

This is the intended development workflow once Tinlog is in place:

```
1.  LLM reads tinlog_index.txt — identifies which systems are active
2.  LLM reads relevant sections of dev_log.txt — locates ✗ FAIL lines
3.  LLM reads relevant source files
4.  LLM states a hypothesis before touching any files
5.  LLM makes targeted edits
6.  Developer runs the program (or triggers Play Mode)
7.  Developer activates the debug trigger for the system under test
8.  Developer stops the program
9.  LLM reads dev_log.txt
10. If ✗ FAIL lines remain → LLM refines hypothesis, edits, go to step 6
11. If log is clean → LLM reports success, flags any debug triggers still active
12. Developer verifies the real (non-debug) trigger path works
```

The LLM should always read the log before making edits if a recent run exists.
The log is the ground truth of what actually happened — not the LLM's memory of the
previous session.

---

## Session Startup Checklist (for the LLM agent)

At the start of every working session, in this order:

1. Read this document (TINLOG.md)
2. Read tinlog_index.txt — understand which systems were active last run
3. Read dev_log.txt — scan for ✗ FAIL and ✗ ERROR lines
4. Read source files relevant to the failures found
5. State a hypothesis before making any edits
6. After edits, tell the developer exactly what to trigger and what to watch for

Do not make edits before reading the log. Do not guess at what happened.
The log exists precisely so guessing is unnecessary.

---

## Implementation Notes

**Tinlog is a design strategy, not a library.**
The DevLog class and TinlogErrorSentinel are small and should be written fresh for each
project and language. The pattern is what matters, not the implementation.

**Start fresh projects with Tinlog baked in.**
Retrofitting Tinlog into an existing project requires touching every file. The value
comes from organic growth — each new system logs itself from the moment it is written.

**Tinlog does not replace visual QA.**
Rendering bugs, animation issues, and layout problems are not captured by value logging.
These require the developer's eyes. Tinlog covers logic, state, and data flow.

**The log complements, not replaces, unit tests.**
Tinlog captures runtime behavior of the full integrated system. Unit tests cover
isolated function correctness. Both have a role; Tinlog is faster to add during
exploratory development when the architecture is still changing.

---

## Naming Reference

| Term | Meaning |
|---|---|
| Tinlog | The overall technique and the log file produced |
| dev_log.txt | The main runtime log file, cleared each run |
| tinlog_index.txt | Sister file listing sections, never cleared |
| TinlogErrorSentinel | The static class that captures runtime errors automatically |
| Debug Trigger | A temporary hardcoded input to force a testable state |
| Section | A named group of log lines belonging to one system |
| Assert | A log line with pass/fail comparison (✓ / ✗ FAIL) |
| Note | A neutral informational log line, no comparison |
| Error | A log line indicating an unexpected failure condition |
