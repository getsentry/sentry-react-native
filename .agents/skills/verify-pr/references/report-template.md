# Report template

Keep it short. Fill every section; write "none" rather than dropping one.

```markdown
# Verification: #<N> <PR title> — <Verified | Not reproduced | Failed | Inconclusive | Not verifiable this way>

> **<Verdict>** on <platforms>. <Claim in one sentence.>
> Without the change: [<event id>](<url>) — <what it showed>. With it: [<event id>](<url>) — <what it showed>.
> Also checked, unchanged: <the paths, or "none">. Not covered: <the short list>.

**Claim:** <one sentence: what was broken or missing, what should be true now>
**Claim source:** <the linked issue #<M> | the PR (no linked issue)>. <What of the issue the PR leaves out, or "the PR covers the issue">
**Platform:** <Android <version> emulator (<AVD>) | iOS <version> simulator (<device>)>, <New | Old> Architecture, <release | debug> build. <Other platform>: not applicable (<why>), if so
**Not covered:** <the other architecture, other RN versions, real devices, debug builds, a platform not run, skipped paths — whatever applies>
**Scenario flow:** `<run-id>.yml` next to this report (or inline below), so the report stands alone

## Check made

1. <user-level steps of the scenario>
2. ...

Expected: without the change <X>; with it <Y>.

| | Without the change | With the change |
|---|---|---|
| Built from | `<sha>` with #<N> reversed (or `<sha>^`) | `<sha>` |
| Run id | `<id>` | `<id>` |
| Evidence link (event / log / trace) | [<id>](<url>) | [<id>](<url>) |
| <evidence> | <what it showed> | <what it showed> |

<Anything that differed beyond the expectation.>

### How the "without" side was built

<Reverse-applied the PR's SDK diff on `<sha>` / checked out `<sha>^`. Whether the touched files changed since the PR.>

## Also checked, expected unchanged

Not part of the verdict. See references/review-checks.md.

| Path | Why | Without | With | Result |
|---|---|---|---|---|
| <scenario> | <other caller / other branch / default option / review question> | <evidence> | <evidence> | Same / Changed |

<For a Changed row: what differs, and whether the PR mentions it. Review questions not checked, and why. Or "none".>

## Spec notes

Not part of the verdict. Only fields the PR adds or changes.

- `<field>` = `<value sent>`: <what the spec says, or "no guidance"> (<URL>)

<or "none: the PR adds or changes no field the SDK sends">

## Sample app changes

<diff and the flow that uses it, or "none"; say they're left in the working tree for the maintainer to decide>

## Screenshots

<paths or embedded images; say why if missing>

## Timing

| Step | Time |
|---|---|
| Plan | |
| Build without the change | |
| Run + evidence visible | |
| Build with the change | |
| Run + evidence visible | |
| **Total** | |

Attempts: <failed builds or runs, why, and time lost — or "first try">. Repeated runs: <"N of M" and what differed, or "none">

## Human intervention

<every step a human had to do, and why — or "none">

## Problems

<flaky or failed steps, workarounds, skill gaps — or "none">
```

## Gate report

For a run the gate stopped, and for every **gate-only** run. Nothing was built.

```markdown
# Verification gate: #<N> <PR title> — <Verifiable | Not verifiable this way>

> **<Verifiable on <platforms> | Not verifiable this way>.** <Claim in one sentence.> <The reason, or the scenario a full run would use.>

**Claim:** <one sentence>
**Claim source:** <the linked issue #<M> | the PR (no linked issue)>
**Platform:** <platforms the claim affects; others not applicable and why>
**Not covered:** <what even a full run wouldn't show>
**Prior evidence:** <events or recordings already linked in the PR or issue, and what they show (one side only, untagged…) — or "none">

## Gate

| Question | Answer |
|---|---|
| Runtime behavior? | <yes / no: why> |
| Trigger possible on a simulator/emulator? | <yes / no: why> |
| Native APIs in the pinned SDKs? | <yes / no: the pinned version and where the path the PR uses landed> |
| "Without" side buildable? | <the reverse patch applies / needs the parent commit> |
| Enough disk? | <yes / no / not checked (gate-only)> |

## <If verifiable: Planned run | If not: What would verify it>

<Verifiable: the scenario, the evidence and expectation for each side, the step 1.6 paths, build type, estimated time.
Not verifiable: a unit test, a real device, a native SDK release, a manual check — or "nothing beyond CI".>

## Timing

<minutes spent>
```
