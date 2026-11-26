---
name: verify-pr
description: Verify a merged or open PR end to end the way a maintainer does — run the sample app on an Android emulator or iOS simulator without the change and with it, find both runs' events in the shared `sentry-sdks` org, and write a before/after draft report. Use when asked to "verify PR #N", "check that the fix works on device", "reproduce the bug and confirm the fix", or to replay an older fix against real Sentry. A gate-only mode answers "can PR #N be verified on a device?" in minutes without building. Android and iOS (simulator).
---

Verify one PR on an Android emulator or iOS simulator against real Sentry. The output is a **draft report** showing the claim's symptom **without** the change and its absence (or the feature's presence) **with** it, linked to both runs' Sentry events.

Android emulator and iOS simulator. Real devices and CI are out of scope for now. Verify on every platform the PR's native changes touch (`packages/core/android/`, `packages/core/ios/`); a JS-only change needs one platform unless the claim is platform-specific.

## Inputs and modes

- **PR number** (required).
- **Review questions** (optional): concerns from a code review, e.g. "does a non-fatal still go through the old path?". Each becomes an unchanged-behavior check (step 1.6), never a conclusion.
- **Mode:**
  - **Full** (default): every step below.
  - **Gate only**: the claim (step 1.1), the gate, then the rest of step 1 only if the gate passes. Answer the gate questions in order; the first "no" decides the answer. Nothing is built, checked out, or changed in the tree. Returns the gate report from the template: *Not verifiable this way* with the reason, or *Verifiable* with the platforms, scenario and evidence a full run would use. Takes a few minutes; meant for a review or a cheap per-PR check.
- Note the start time when you begin; the report's timing counts from it.
- Running as a subagent: return the report text as your answer; the caller saves it.

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
| **Not verifiable this way** | Decided in step 1, before any build: the claim isn't observable on a simulator/emulator, or the change can't be built yet. Say why and what would verify it instead. |

Prefer **Inconclusive** over a guess, and **Not verifiable this way** over a run that can't separate the two sides.

## 1. Plan

Read the PR and anything it links: `gh pr view <N> --json title,body,mergeCommit,baseRefOid,headRefOid,files,comments`, plus the linked issue.

Write down, before touching anything:

1. **Claim** — one sentence: what was broken (or missing) and what should be true now. Take it from the **linked issue**'s problem statement and repro, not from the PR description: the issue says what users hit, the PR says what the author fixed. Build the scenario from the issue's repro. When the PR fixes something narrower or different from the issue, verify the PR's claim and say in the report what of the issue it leaves out. With no linked issue, use the PR and say so.
2. **Platform** — which platforms the claim affects: Android, iOS, or both. Run each one. A JS-only change whose effect goes through a bridge method that each platform handles differently (e.g. one applies fields the other ignores) affects both. A platform the PR doesn't touch and the claim doesn't affect is **not applicable**; say so on the report's Platform line (it isn't a verdict).
3. **Scenario** — the user actions in `samples/react-native` that produce the symptom. Search the sample's screens (`src/Screens/`, `src/tabs/`) for a way to trigger the symptom, and write the scenario for this run. Add a sample button only if none exists. Leave it in the working tree next to its flow and list it in the report; the maintainer decides whether it's committed. A flow must never point at a button that isn't in the tree.
   - **How the sample starts the native SDK matters.** By default both platforms start the native SDK from `samples/react-native/sentry.options.json` (`RNSentrySDK.init` / `[RNSentrySDK start]`), and JS `Sentry.init` runs with `autoInitializeNativeSdk: false`. Options set in `App.tsx` don't reach the native SDK. For native option claims, set the option in `sentry.options.json` (and say so in the report).
     - iOS: the `sentryDisableNativeStart: true` launch argument switches to JS init (the iOS e2e tests use it).
     - Android: building with `SENTRY_DISABLE_NATIVE_START=true` did **not** work in a release build (JS still saw it as off); don't rely on it.
   - **Check the sample's defaults don't hide the symptom.** Its default tracing syncs the JS trace to native on the first navigation span, which hid a trace-sync bug until tracing was turned off for the run. `App.tsx` sets `ignoreErrors: ['should', /(.)*2(.)*/]`: an error whose message contains "should" or the digit 2 is dropped, so never put a run id or a date in a scenario's error message (events captured natively don't go through it). `profilesSampleRate: 1.0` keeps the Hermes sampler busy during profiled transactions, which can starve a feature that shares it (e.g. JS hang stacks). `maskAllText: true` stops touch labels and text from being read. Turn off what's in the way for the run and list it under sample changes.
   - **Build-configuration claims** (a module excluded, a Gradle property, a Pod subspec) whose effect shows up at runtime, in Sentry events or on device. E.g. #7035: excluding `sentry-android-replay` changes the native SDK's init, which shows in `sdk.name` and in logcat. Make the change in the sample's build files, then confirm it took effect in the built app before running, e.g. Android: `unzip -o app.apk 'classes*.dex' -d <out-dir>/dex && $ANDROID_HOME/build-tools/<version>/dexdump <out-dir>/dex/classes*.dex | grep -c '<class path>'`. That check only confirms the build change; the evidence still comes from the run. When the build change's only effect is what's shipped, the gate stops it (runtime behavior).
4. **Evidence** — what you'll read in Sentry (or on device) to tell the two runs apart, and what each run should show. See [references/evidence.md](references/evidence.md).
5. **Build type** — release when the scenario needs a native crash (Android: `Sentry.nativeCrash()` only crashes in release; iOS: a debugger catches the crash first, so never run the scenario from Xcode) or when the PR is about release behavior; otherwise debug is fine.
   - Android: the sample's `release` build type sets `debuggable true` (`android/app/build.gradle`), so the SDK skips the synchronous hard-crash write (#6937) and queues a JS fatal instead. The event is then delivered only when the process outlives the crash (crash dialog shown), never when the OS kills it at once (#7113). When the evidence is a JS fatal event (capture or delivery), build with `debuggable false`. `run-as` doesn't work on that build, so read the cache from in-app logs.

6. **Also check** — up to two nearby paths the diff touches besides the fix (another caller, the other branch of a new condition, a new option left at its default), each expected to give the **same** evidence on both builds. Add the review questions here. How to pick and report them: [references/review-checks.md](references/review-checks.md).
7. **Not covered** — what this run won't show: the other architecture, other React Native versions, real devices, debug builds, a platform not run, paths from step 6 you skipped.

If you can't state the evidence that would separate the two runs, stop and ask; the run would prove nothing.

### Gate: can this be verified on a device?

Answer these before building, in order. The first "no" ends the run with **Not verifiable this way** for that platform; write the gate report (see the template) with the reason and what would verify it instead, and build nothing. Write the questions after that "no" as "not reached", and Without side and Also check as "not needed". Don't answer them anyway. In **gate-only** mode, stop after the gate either way and write the gate report.

- **Is the claim about runtime behavior?** Build fixes, dependency bumps, Metro/bundler config, type-only changes, and performance claims don't produce a difference in Sentry events. A run can only show nothing broke; say so instead of running. A change whose only effect is what's shipped (bundle contents, APK or app classes, size) is **Not verifiable this way**: the gate report names a bundle or APK content check as what would verify it, with the command. Android: `unzip -p app.apk assets/index.android.bundle | LC_ALL=C grep -a -c '<string>'`, and `dexdump` for classes (step 1.3). iOS: `LC_ALL=C grep -a -c '<string>' sentryreactnativesample.app/main.jsbundle`.
- **Can the trigger happen on a simulator/emulator?** For example, MetricKit reports, real-device hardware, OS-scheduled background work, and store-only behavior can't.
- **Do the bundled native SDKs and the sample's React Native have what the PR relies on?** Check the pinned versions on the checkout you'll build (for an open PR, its head) (`packages/core/RNSentry.podspec` `sentry_cocoa_version`, `packages/core/android/build.gradle` `sentryAndroidVersion`) against the release where the **path the PR uses** landed, which can be later than the API itself (e.g. an options-dictionary key). Find it with `gh release view <version> --repo getsentry/sentry-cocoa` (or `sentry-java`) and grep the notes for the native PR. Check the sample's `react-native` version (and Hermes) the same way when the PR depends on a React Native or Hermes behavior. A PR waiting on a native bump can't be built on that platform yet. For an open PR in gate-only mode, read the head's files without checking it out: `git fetch origin pull/<N>/head`, then `git show <headRefOid>:<path>` (`FETCH_HEAD` is overwritten by the next fetch).
- **Is there enough disk?** `df -h /System/Volumes/Data` — stop under ~15 GB free. Clean iOS and Android sample builds together take ~13 GB. Skip this one in gate-only mode: it's about this machine, not the PR.

Not a gate question, but part of the plan in either mode, only when the gate passes: **how the "without" side will be built.**

- Open PR: the head with its own diff reversed. That always applies. Note instead what a full run would have to add or watch: whether the head has the run tagging (`samples/react-native/src/verifyRun.ts`) and this skill's `flows/steps/`, how far its base is behind `main`, and whether `main` has since changed the PR's files or the pinned native versions.
- Merged PR: save the merge commit's SDK patch (step 2) and run `git apply -R --check` on the current checkout. It's read-only. If it fails, plan the slower parent-commit fallback. Either way the run goes ahead.

### Feature PRs

A feature has no symptom; verify its **presence**:

- "Without" is still the PR's SDK change reversed. Keep the PR's own sample changes (a new option, a new button) on both sides, so only the SDK differs.
- If the sample calls a new API that doesn't exist without the change, guard the call (`?.method?.()`) on the "without" side only, and say so.
- An opt-in option can be checked more cheaply with one build and the option off, but that doesn't show the default is unchanged; prefer the reversed build.

## 2. Without the change

Build the "without" side from the current checkout with only the PR's SDK change reversed. This needs one clean build; the "with" side is then an incremental rebuild.

Before the first build:

- `node_modules` must match the checkout: `node -p "require('react-native/package.json').version"` in `samples/react-native` equals the pinned version in its `package.json`; otherwise `yarn install`.
- The run-tagging code (`samples/react-native/src/verifyRun.ts` and the `tagVerifyRun()` call in `App.tsx`) must be in the tree. A PR branched before it landed doesn't have it: copy both from `main`, and list them under sample changes.
- If the PR's head doesn't contain this skill, copy `flows/steps/` out of the repo before checking the head out, and point `runFlow` at the copy.

```bash
# merged PR — save the merge commit's SDK changes (no tests/changelog), then reverse them
git show <merge-sha> -- packages/core \
  ':!packages/core/test' ':!packages/core/RNSentryAndroidTester' ':!packages/core/RNSentryCocoaTester' \
  > <out-dir>/pr<N>.patch
# open PR — check out the head first, then save its diff against the base
git diff <baseRefOid> <headRefOid> -- packages/core \
  ':!packages/core/test' ':!packages/core/RNSentryAndroidTester' ':!packages/core/RNSentryCocoaTester' \
  > <out-dir>/pr<N>.patch

git apply -R --check <out-dir>/pr<N>.patch && git apply -R <out-dir>/pr<N>.patch
```

Keep the patch in a file; a shell variable holding the command breaks under zsh ("No valid patches in input").

- Merged PRs: first check the files the PR touched haven't changed on your checkout since: `git diff <merge-sha> HEAD -- <files>` is empty, or the revert won't be the PR's exact before-state. Note it in the report either way.
- Open PRs: you build the head itself. Say which base it's on; if it needs something `main` has (e.g. a native bump), apply the PR's patch onto `main` instead and say so.
- **Spec changes** (`NativeRNSentry.ts`, `*NativeComponent.ts`): check the generated code matches each side (iOS: grep `samples/react-native/ios/build/generated/ios/ReactCodegen/RNSentrySpec*.h` for the method; reinstall Pods if it's stale). A stale spec makes the "with" run silently skip the new method and look like Failed.
- When `git apply -R --check` fails, fall back to the parent commit: `git checkout <merge-sha>^` (detached), `yarn install && yarn build`, build there, then return. Slower; record that you did it.
- The sample bundles `packages/core/dist/`. Before the first sample build, run `yarn build` in `packages/core` if `dist/` is older than the last change to `packages/core/src` (`git log -1 --format=%cd -- packages/core/src`) — even for native-only PRs.
- **JS changes** (`packages/core/src/`) need that `yarn build` on **both** sides.
- **Android reuses a stale JS bundle.** Gradle's bundle task stays up to date after `packages/core/dist` changes, so the "with" APK ships the "without" JS and reads as **Failed**. After every `yarn build` in `packages/core`, force the re-bundle (see references/android.md), then confirm the APK has the side's code: `unzip -p samples/react-native/app.apk assets/index.android.bundle > <out-dir>/<side>.bundle && LC_ALL=C grep -a -c '<string only the PR adds>' <out-dir>/<side>.bundle` is non-zero with the change and zero without it. Pick a string literal (a log message, an option name); identifiers are minified. The release bundle is Hermes bytecode: without `LC_ALL=C grep -a`, grep prints nothing at all.
- `yarn build` in `packages/core` rewrites the tracked `packages/core/android/libs/replay-stubs.jar`; the restore at the end covers it.
- iOS: a native-only change is a ~45 s incremental rebuild on the "with" side; CocoaPods doesn't need reinstalling, because `RNSentry` is a local `:path` pod.

## 3. Run

Setup, build, install, and drive commands are in [references/android.md](references/android.md) and [references/ios.md](references/ios.md). The short version:

- Android: full emulator image (e.g. `Pixel_8`), not an ATD image — ATD returns black screenshots. JDK 17, `SENTRY_DISABLE_AUTO_UPLOAD=true`, `yarn build-android-release`. Uninstall before every install, and check `adb install` printed `Success`: `adb install -r` can fail for space, and a failed install leaves an older sample app (possibly from another session) running. Don't keep `adb -s <serial>` in a zsh variable: zsh doesn't split it, and the command silently does nothing.
- Prefer **release** builds. Debug builds load JS from whatever Metro is on port 8081 (another session's, if one is running), and the all-ABI debug APK may not fit on the emulator.
- iOS: a booted simulator, Pods installed for the build you make (`yarn pod-install-release-static`), `SENTRY_DISABLE_AUTO_UPLOAD=true`, `yarn build-ios-release`.
- Maestro needs JDK 17 on both platforms. With an emulator and a simulator both running, pass `--device <id>`.
- Drive the UI with **Maestro**. Compose the run's scenario from the shared steps in [flows/steps/](flows/steps/) (`launch.yml` with the run tags, `open-errors-screen-button.yml`, `native-crash-and-relaunch.yml`), using [flows/examples/](flows/examples/) as a pattern. Save the flow next to the report, not in the skill.
- Don't add flows or steps to the skill during a verification run. Promote something to `flows/steps/` only when a second run needs it, in a separate change.
- Pass the run tags as launch arguments (next step). Relaunch after a crash so the event is sent.
- Logs and other batched data are sent later: keep the app running ~20 s after the flow before looking them up.
- Capture proof that the scenario ran: a screenshot of its result, or a device-log line when the screen can't show it (a blocked JS thread shows only the tap). Keep the device log from the run's start (Android: `adb logcat -c` before, `adb logcat -d` after; iOS: `xcrun simctl spawn <udid> log show --start "<run start>" --predicate 'process == "sentryreactnativesample"'`), and grep it by the run's own id.

## 4. Tag

The sample tags every event with these when they're passed as launch arguments (`samples/react-native/src/verifyRun.ts`); without them it tags nothing:

| Launch argument | Tag | Value |
|---|---|---|
| `verifyPr` | `verify.pr` | PR number |
| `verifyCommit` | `verify.commit` | short sha of the checkout you built (`git rev-parse --short HEAD`); for the "without" side add the reversed PR: `<HEAD>-<merge-sha>` |
| `verifyRunId` | `verify.run_id` | unique per run: `pr<N>-<without\|with>-<yyyymmdd-hhmm>` |

Use a fresh run id for every attempt, so a retry never picks up a previous attempt's event. Tags set from JS sync to the native scope, so native crash events carry them too.

## 5. Check

Look the evidence up in `sentry-sdks` (region `https://us.sentry.io`, project `sentry-react-native`) through the Sentry MCP. Repeat every ~30 s; give up after **5 minutes** → Inconclusive. The lookup per evidence type, link formats, and pitfalls are in [references/evidence.md](references/evidence.md). For error events:

1. `search_errors` with `verify.run_id:<id>` and `period: 1h`. Pass `fresh: true` on retries: a repeated query can return a cached empty result.
2. Open each hit with `get_sentry_resource` on its **issue-event URL** (`https://sentry-sdks.sentry.io/issues/<SHORT-ID>/events/<event-id>/`). A bare event id fails.
3. Read the event detail, not the Discover columns: Discover shows `""` for a missing tag and an empty one alike.

Logs can't be searched by `verify.run_id`; put the run id in the log message (see evidence.md).

Compare against the expectation from step 1. Unexpected extra differences go in the report. Check the step 1.6 paths the same way: same evidence on both sides, or describe the change.

When the PR adds or changes a field the SDK sends (`mechanism.type`, `handled`, a span op or origin, an attribute name), compare the value in the "with" event with the published spec and write a spec note: [references/review-checks.md](references/review-checks.md#spec-notes). Notes don't affect the verdict.

**Absences need a control, surprises need repeats.**

- When the evidence is that something is missing (no event, no tag), add a control to the same run: an action on the same build whose event must arrive (e.g. the sample's "Uncaught Thrown Error" next to a new fatal path). A missing event with the control present is evidence; both missing is Inconclusive.
- When a run surprises you (an expected event doesn't arrive, a side behaves differently from the claim), repeat it twice more with fresh run ids before deciding. Report the count ("delivered in 2 of 3 runs") and what differed between the runs in the device log, not one run's guess at the cause.

## 6. Report

Write the report with [references/report-template.md](references/report-template.md) to a local file (scratchpad, or `samples/react-native/verify-reports/` if the maintainer wants it in the tree). Running as a subagent that can't write report files: return the full report text instead, and the parent saves it. Include the verdict, the claim, the exact scenario, both event links, screenshots, the sample diff if any, timings, and every problem hit. Start with the **summary block**: a few lines a maintainer can paste into the PR (verdict, claim, the two event links, what's not covered). Then show it and ask before posting anywhere.

Finally:

- Restore the SDK sources with `git checkout -- packages/core` (this also restores `replay-stubs.jar`), or return from the detached parent checkout. If you ran `yarn build` in `packages/core`, run it again after the restore and then restore `replay-stubs.jar` once more (`git checkout -- packages/core/android/libs/replay-stubs.jar`): otherwise `dist/` stays on the last side you built. Skip this when the last side you built was the unmodified checkout.
- iOS: restore what `pod install` rewrote: `git checkout -- samples/react-native/ios/sentryreactnativesample.xcodeproj samples/react-native/ios/sentryreactnativesample/PrivacyInfo.xcprivacy`. The ignored `Pods/` then no longer match the tracked project, which is why every iOS run reinstalls Pods first.
- Shut down any simulator or emulator you booted (`xcrun simctl shutdown <udid>`, `adb -s <serial> emu kill`), and stop any Metro or helper server you started. Leave devices and servers you didn't start alone.
- Remove the large build outputs you created if disk is short: `samples/react-native/{ios/DerivedData,ios/build,android/app/build,app.apk,sentryreactnativesample.app}` (all git-ignored).
- Report `git status`.

## Recording what you learn

When a step needed a human, a retry, or a workaround, add it to the report's *Problems* list. When it will recur, fix the skill or the flow in the same session.
