---
name: diagnosing-bugs
description: A discipline for hard bugs, flaky tests, CI hangs, native crashes, and performance regressions in this SDK. Use when the user says "diagnose" or "debug this", reports something broken/throwing/failing/hanging/slow/crashing, or a test is flaky. Builds a tight, red-capable feedback loop before hypothesizing.
---

A discipline for hard bugs. Skip a phase only when you can say why.

**The whole skill is Phase 1: get a loop that goes red on this bug.** Everything after is mechanical once you have it. If you catch yourself reading code to form a theory before that loop exists, stop — jumping to a hypothesis without a red-capable loop is the exact failure this prevents.

For trivial bugs with an obvious fix and an obvious test, skip this and just write the failing test — this skill is for the bugs that resist.

## Phase 1 — Build a feedback loop

A **tight** loop is fast, deterministic, and goes **red** on *this* bug. Build one and the bug is 90% solved. Be aggressive and creative here — spend disproportionate effort.

### Ways to construct one — try roughly in this order

1. **Failing Jest test at the seam** — `yarn test path/to/file.test.ts -t 'name'`, at whatever seam reaches the bug. Tightest loop there is. Mock the bridge via `test/mockWrapper.ts`.
2. **Fake-timer harness** — for flush timers, debounces, retries, and most flakes: `jest.useFakeTimers()` and advance the clock deterministically instead of waiting.
3. **Arch/platform matrix** — reproduce under the failing combination: pin `Platform.OS`, `isTurboModuleEnabled()`, `isFabricEnabled()`. "Only on New Arch" or "only on Android" is a clue *and* the loop's config.
4. **Replay a captured payload** — save a real envelope / event / native payload to disk and push it through the code path in isolation. Great for serialization / round-trip bugs.
5. **Throwaway harness** — a minimal script exercising the bug path with mocked deps.
6. **Sample app** — when the bug only shows end-to-end, reproduce in `samples/react-native` (or `samples/expo`); see their `AGENTS.md`. Slower loop; use only when a unit seam can't reach it.
7. **Native repro** — for a native crash / leak, reproduce in the native test targets (iOS `RNSentryCocoaTester`, Android instrumentation) or with the sample app + native debugger. The bridge can't be faked here.
8. **Stress / repetition loop** — for non-deterministic bugs: run the trigger 100×, narrow timing windows, inject delays. Goal is a higher reproduction rate, not a clean repro.
9. **Differential loop** — same input through two versions/configs (e.g. before/after a dependency or RN bump) and diff the output. For regressions that "appeared after X".

### Tighten the loop

Once you have *a* loop, treat it as a product: **faster** (narrow scope, skip unrelated init), **sharper** (assert the exact symptom the user described, not "didn't crash"), **more deterministic** (fake timers, seed randomness, no real network/bridge). A 2-second deterministic loop beats a 30-second flaky one. For non-deterministic bugs the goal is a *high enough* reproduction rate to debug against — 50% is debuggable, 1% is not.

### Completion criterion

Phase 1 is done when you can name **one command** — a test invocation or script — that you have **already run at least once** (paste the invocation and its output), and that is:

- [ ] **Red-capable** — drives the actual bug path and asserts the user's exact symptom
- [ ] **Deterministic** — same verdict every run (flaky bugs: a pinned, high reproduction rate)
- [ ] **Fast** — seconds, not minutes

No red-capable command, no Phase 2.

### When you genuinely cannot build a loop

Say so explicitly, list what you tried, and ask the user for: an environment that reproduces it, a captured artifact (envelope dump, native crash log / symbolicated stack, CI run, screen recording with timestamps, `adb logcat` / Xcode console output), or permission for temporary instrumentation. Do **not** hypothesise without a loop.

## Phase 2 — Reproduce and minimise

Run the loop, watch it go red. Confirm it produces the failure mode the **user** described — not a nearby one (wrong bug = wrong fix). Then shrink the repro to the smallest scenario that still goes red: cut inputs, callers, config, and steps **one at a time**, re-running after each cut. Done when every remaining element is load-bearing. The minimal repro becomes the regression test.

## Phase 3 — Hypothesise

Generate **3–5 ranked, falsifiable hypotheses** before testing any — a single hypothesis anchors you on the first plausible idea. Each states its prediction: "If X is the cause, then changing Y makes the bug vanish." If you can't state the prediction, it's a vibe — sharpen or discard it. Show the ranked list to the user; they often re-rank it instantly ("we just changed #3"). Common suspects in this SDK: arch/platform branch, bridge serialization, timer/async ordering, scope-sync recursion, native memory/lifecycle, RN or native-SDK version skew.

## Phase 4 — Instrument & fix

Confirm the hypothesis with the cheapest observation that would falsify it (a log via `debug`, a native breakpoint, a diffed payload) before changing code. Then make the minimal fix, watch the loop go green, and keep the minimal repro as the regression test. Re-run the broader suite (`yarn test`) and, for native/bridge fixes, the affected native tests and both architectures.
