---
name: verify-pr
description: Verify a merged or open PR end to end the way a maintainer does — run the sample app on an Android emulator without the change and with it, find both runs' events in the shared `sentry-sdks` org, and write a before/after draft report. Use when asked to "verify PR #N", "check that the fix works on device", "reproduce the bug and confirm the fix", or to replay an older fix against real Sentry. Android only for now.
---

Verify one PR on a real Android emulator against real Sentry. The output is a **draft report** showing the claim's symptom **without** the change and its absence (or the feature's presence) **with** it, linked to both runs' Sentry events.

Android only. iOS and CI are out of scope for now — say so and stop if the PR's claim is iOS-only.

## Rules

- **Draft only.** Save the report locally and show it. Never post it to GitHub, Linear, or Slack, and never change an issue or PR, unless the maintainer asks in this session.
- Every repo here is public: the report holds no customer names, emails, tokens, or DSNs. Event links into `sentry-sdks` are fine.
- Leave the working tree as you found it, except for scenario changes to the sample (step 1.3). Undo every SDK revert and list what you left behind.
- Don't run the root formatters (`oxfmt`) on `samples/react-native` files: they rewrite whole files the sample never formatted. Match the surrounding style by hand.
- Never edit the PR's code to make it pass. If the change doesn't do what it claims, that is the verdict.

## Verdicts

| Verdict | Meaning |
|---|---|
| **Verified** | Symptom seen without the change, gone (or feature present) with it. |
| **Not reproduced** | No symptom without the change, so the fix proves nothing on this setup. |
| **Failed** | Symptom still present with the change. |
| **Inconclusive** | An event didn't arrive in time, the build/run broke, or the evidence is indirect. Say which. |

Prefer **Inconclusive** over a guess.

## 1. Plan

Read the PR and anything it links: `gh pr view <N> --json title,body,mergeCommit,baseRefOid,headRefOid,files,comments`, plus the linked issue.

Write down, before touching anything:

1. **Claim** — one sentence: what was broken (or missing) and what should be true now.
2. **Platform** — confirm the claim affects Android. A change under `packages/core/ios/` only is out of scope.
3. **Scenario** — the user actions in `samples/react-native` that produce the symptom. Search the sample's screens (`src/Screens/`, `src/tabs/`) for a way to trigger the symptom, and write the scenario for this run. Add a sample button only if none exists. Leave it in the working tree next to its flow and list it in the report; the maintainer decides whether it's committed. A flow must never point at a button that isn't in the tree.
   - **How the sample starts the native SDK matters.** By default Android starts the native SDK from `samples/react-native/sentry.options.json` (`RNSentrySDK.init`), and JS `Sentry.init` runs with `autoInitializeNativeSdk: false`. Options set in `App.tsx` don't reach native Android. For native option claims, set the option in `sentry.options.json` (and say so in the report). Building with `SENTRY_DISABLE_NATIVE_START=true` to switch to JS init did **not** work in a release build (JS still saw it as off); don't rely on it.
4. **Evidence** — what you'll read in Sentry (or on device) to tell the two runs apart, and what each run should show. See [references/evidence.md](references/evidence.md).
5. **Build type** — release when the scenario needs a native crash (`Sentry.nativeCrash()` only crashes in release) or when the PR is about release behavior; otherwise debug is fine.

If you can't state the evidence that would separate the two runs, stop and ask; the run would prove nothing.

## 2. Without the change

Build the "without" side from the current checkout with only the PR's SDK change reversed. This needs one clean build; the "with" side is then an incremental rebuild.

```bash
# merged PR — reverse the merge commit's SDK changes, keep tests/changelog
git show <merge-sha> -- packages/core \
  ':!packages/core/test' ':!packages/core/RNSentryAndroidTester' ':!packages/core/RNSentryCocoaTester' \
  | git apply -R --check && <same command> | git apply -R
# open PR — check out the head first, then reverse its diff against the base
git diff <baseRefOid> <headRefOid> -- packages/core ':!packages/core/test' ... | git apply -R
```

- First check the files the PR touched haven't changed on your checkout since: `git diff <merge-sha> HEAD -- <files>` is empty, or the revert won't be the PR's exact before-state. Note it in the report either way.
- When `git apply -R --check` fails, fall back to the parent commit: `git checkout <merge-sha>^` (detached), `yarn install && yarn build`, build there, then return. Slower; record that you did it.
- The sample bundles `packages/core/dist/`. Before the first sample build, run `yarn build` in `packages/core` if `dist/` is older than `HEAD` — even for native-only PRs.
- **JS changes** (`packages/core/src/`) need that `yarn build` on **both** sides.
- `yarn build` in `packages/core` rewrites the tracked `packages/core/android/libs/replay-stubs.jar`; the restore at the end covers it.

## 3. Run

Setup, build, install, and drive commands are in [references/android.md](references/android.md). The short version:

- Full emulator image (e.g. `Pixel_8`), not an ATD image — ATD returns black screenshots.
- JDK 17, `SENTRY_DISABLE_AUTO_UPLOAD=true`, `yarn build-android-release` (or `-debug` + Metro).
- Drive the UI with **Maestro**. Compose the run's scenario from the shared steps in [flows/steps/](flows/steps/) (`launch.yml` with the run tags, `open-errors-screen-button.yml`, `native-crash-and-relaunch.yml`), using [flows/examples/](flows/examples/) as a pattern. Save the flow next to the report, not in the skill.
- Don't add flows or steps to the skill during a verification run. Promote something to `flows/steps/` only when a second run needs it, in a separate change.
- Pass the run tags as launch arguments (next step). Relaunch after a crash so the event is sent.
- Logs and other batched data are sent later: keep the app running ~20 s after the flow before looking them up.
- Capture a screenshot at the step that shows the scenario ran, and keep logcat: `adb logcat -d > <dir>/<run-id>.logcat`.

## 4. Tag

The sample tags every event with these when they're passed as launch arguments (`samples/react-native/src/verifyRun.ts`); without them it tags nothing:

| Launch argument | Tag | Value |
|---|---|---|
| `verifyPr` | `verify.pr` | PR number |
| `verifyCommit` | `verify.commit` | short sha of what the run built, with `^` for the "without" side (`<merge-sha>^`) |
| `verifyRunId` | `verify.run_id` | unique per run: `pr<N>-<without\|with>-<yyyymmdd-hhmm>` |

Use a fresh run id for every attempt, so a retry never picks up a previous attempt's event. Tags set from JS sync to the native scope, so native crash events carry them too.

## 5. Check

Look the evidence up in `sentry-sdks` (region `https://us.sentry.io`, project `sentry-react-native`) through the Sentry MCP. Repeat every ~30 s; give up after **5 minutes** → Inconclusive. The lookup per evidence type, link formats, and pitfalls are in [references/evidence.md](references/evidence.md). For error events:

1. `search_errors` with `verify.run_id:<id>` and `period: 1h`.
2. Open each hit with `get_sentry_resource` on its **issue-event URL** (`https://sentry-sdks.sentry.io/issues/<SHORT-ID>/events/<event-id>/`). A bare event id fails.
3. Read the event detail, not the Discover columns: Discover shows `""` for a missing tag and an empty one alike.

Logs can't be searched by `verify.run_id`; put the run id in the log message (see evidence.md).

Compare against the expectation from step 1. Unexpected extra differences go in the report.

## 6. Report

Write the report with [references/report-template.md](references/report-template.md) to a local file (scratchpad, or `samples/react-native/verify-reports/` if the maintainer wants it in the tree). Include the verdict, the claim, the exact scenario, both event links, screenshots, the sample diff if any, timings, and every problem hit. Then show it and ask before posting anywhere.

Finally, restore the SDK sources with `git checkout -- packages/core` (this also restores `replay-stubs.jar`), or return from the detached parent checkout, and report `git status`.

## Recording what you learn

When a step needed a human, a retry, or a workaround, add it to the report's *Problems* list. When it will recur, fix the skill or the flow in the same session.
