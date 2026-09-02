---
name: review
description: Three-axis review of the branch diff — Standards (this repo's documented standards + public API/bridge surface), Spec (the originating Linear/GitHub issue or PR), and Correctness (runtime bugs + the RN SDK threat model — PII, native crashes/leaks, bridge serialization, arch parity, concurrency). Runs the axes as parallel sub-agents and reports them side by side. Use when reviewing a branch, a PR, or work-in-progress changes before opening or merging, or "review since X".
---

Review the diff between `HEAD` and a base, on three axes:

- **Standards** — does the diff conform to this repo's documented standards?
- **Spec** — does it faithfully implement the originating issue / PR?
- **Correctness** — will it actually work, and is it safe?

Run the axes as **parallel sub-agents** so none pollutes another's context, then aggregate. Report them side by side, and **never rerank across axes** — keeping them separate is the whole point (see *Why separate axes*).

Run this on demand before opening or merging a PR (Warden's automated PR review uses the remote `code-review` + `find-bugs` skills; this local pass is the RN-tailored, deeper review you invoke yourself). It complements `security-review` (deeper security audit), `gha-security-review` (workflow/CI), and `span-convention-review` (tracing-span conventions) — invoke those for depth. It is *not* a debugger: when a bug is already known and reproducing, use `diagnosing-bugs`.

## 1. Pin the base

Use whatever base the user named — a commit, branch, tag, or `HEAD~N`. If they named none, default to the merge-base with the default branch (`git merge-base HEAD origin/main`). Capture once:

- `git diff <base>...HEAD` (three-dot, so it compares against the merge-base)
- `git log <base>..HEAD --oneline`

Confirm the ref resolves (`git rev-parse <base>`) and the diff is non-empty. A bad ref or empty diff fails **here** — not inside parallel sub-agents.

## 2. Identify the spec source

Look for the originating spec, in order:

1. Linear issue references (e.g. `RN-###`) in commit messages or the PR (fetch via the Linear tools).
2. GitHub issue/PR references (`gh issue view` / `gh pr view --json title,body,comments`).
3. A path the user passed.

If none is found, ask. If there genuinely is no spec, the Spec sub-agent skips and reports "no spec available".

## 3. Spawn the sub-agents in parallel

Send one message with three `Agent` tool calls (a general-purpose subagent each). Give each the diff command and the commit list, plus its brief:

**Standards sub-agent:**

> Read `.agents/skills/code-guidelines/SKILL.md`, `.agents/skills/code-guidelines/references/native-bridge.md`, and `.agents/skills/test-guidelines/SKILL.md`, then review the diff against them.
> **Top priority — public surface:** for any change to the barrel (`packages/core/src/js/index.ts`), an exported option in `options.ts`, or a codegen spec (`src/js/NativeRNSentry.ts`, `*NativeComponent.ts`), classify each exported/spec symbol as added / removed / signature-changed / behavior-changed. Flag every removal or incompatible change as a **breaking change** (semver-major) and check it carries a deprecation path; flag a bridge spec change that isn't backward-compatible or isn't mirrored across JS/iOS/Android. Note if the API report (`packages/core/etc/sentry-react-native.api.md`) needs regenerating.
> Then report, per file/hunk, every place the diff violates a documented standard — cite the rule. For areas the docs don't cover, apply the smell baseline in `.agents/skills/review/references/smell-baseline.md` as judgement calls. Distinguish hard violations from judgement calls; a documented standard overrides the baseline. Skip anything ESLint/oxlint/Prettier/clang-format/ktlint/swiftlint enforce. Under 400 words.

**Spec sub-agent** (skip and note if no spec):

> Report: (a) requirements the spec asked for that are missing or partial; (b) behavior in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but wrong. For this SDK check the spec's platform/architecture scope (iOS/Android, New/Old Arch) and opt-in vs default-on decision are actually honored. Quote the spec line for each finding. Under 400 words.

**Correctness sub-agent:**

> Find bugs and unsafe code the diff introduces — not style, which Standards owns. Check, per file/hunk:
> - **Runtime bugs** — unhandled promise rejections / fire-and-forget async, uncleared timers or listeners, missing null/undefined guards, swallowed errors, races/TOCTOU, missing teardown in an integration.
> - **RN SDK threat model** —
>   - **PII**: data collected or placed into breadcrumbs/events/span attributes/logs without gating on `options.sendDefaultPii` (deep-link URLs, navigation params, device identifiers, request/response bodies). Undocumented always-on collection.
>   - **Native safety**: a native exception that could crash the host app, a leaked JNI local ref, an iOS retain cycle, a `Promise` neither resolved nor rejected (hangs the JS caller).
>   - **Bridge**: non-serializable payloads (functions, class instances, `undefined` holes, circular refs, `BigInt`), `toJSON`/normalization round-trip errors, codegen type-vocabulary violations, an ABI change not mirrored across JS/iOS/Android or not backward-compatible with an older cached native binary.
>   - **Arch/platform parity**: logic that works on one of New/Old Arch or iOS/Android but not the other.
>   - **Recursion/hot path**: wrapping `RNSentry` scope-sync methods, or using the Logs API `logger` (vs `debug`) in the TurboModule wrap path — see `packages/core/AGENTS.md`.
>   - **Resource growth**: unbounded buffers/queues/caches; a periodic flush timer that re-arms forever.
> For each finding give file:line, a one-line severity (critical/high/medium/low), why it's real (not already handled, no covering test), and a concrete fix. Skip anything the linters or existing tests already catch. Under 400 words.

## 4. Aggregate

Present the reports under `## Standards`, `## Spec`, and `## Correctness` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings across axes.

End with a one-line summary per axis: total findings, and the worst issue *within that axis*. Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why separate axes

Each axis asks a different question and would drown the others if merged: Standards is about conformance, Spec about intent, Correctness about safety. A critical native-crash bug and a barrel-file naming nit are not comparable, and forcing them onto one ranked list buries the one that matters under the one that's easy to find. Keeping them side by side lets the reader act on each in its own terms.
