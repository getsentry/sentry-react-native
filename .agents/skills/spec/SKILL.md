---
name: spec
description: Produce a verified spec — problem, desired outcome, and acceptance criteria — before building. Use when given a GitHub/Linear issue link, when starting from a fuzzy in-conversation idea, or asked to "figure out what to do" / "scope this" / "what should I build" — whenever the *what* isn't yet pinned down. Grills the ambiguities, checks the premise against the code, and produces acceptance criteria you sign off on — then hands to design-first.
---

Settle *what* to build and *why* — with verifiable acceptance criteria — before any design or code. This is the front of the pipeline: **spec** (what) → **design-first** (how) → **code-guidelines** + **test-guidelines** (build) → **review** (which verifies the result against this spec).

Run it for a tracked issue or a fuzzy ask. Skip it — and say so — when the ask is already a precise, verifiable instruction.

## 1. Establish the source

Get the raw intent from wherever it lives:

- **From a tracked issue** (a GitHub/Linear link) — fetch it, don't work from the link text or your memory of it:
  - **GitHub:** `gh issue view <url-or-number> --json title,body,comments,labels,state`, plus any linked PRs.
  - **Linear:** the Linear tools — the issue and its comments. Sentry SDK issues often carry a Linear backlink (e.g. `RN-###`) in a comment.
  - Read the full body, **every comment**, labels, and linked issues/PRs. The real decision is often buried in a comment, not the title.
- **From an in-conversation idea** — start from what the user said, in their words. If a tracked issue might exist, ask for the link; otherwise proceed — the spec itself is the source of truth.

Either way you now hold the raw intent — usually vague. Sharpen it below.

## 2. Reconstruct the real intent

The raw ask usually names a symptom; the real need is underneath. State, in the domain's own words: the problem this solves, who it's for (SDK user? a downstream SDK like Flutter/.NET that depends on the native layer?), and what "done" looks like. Separate the *reported symptom* from the *underlying need* — they're often not the same fix.

## 3. Check the premise against the code

The ask may be stale, partial, or wrong. Investigate before believing it:

- Does the described behavior actually exist / reproduce? For a bug, find the code path — and if it's non-trivial, build the repro loop now (see **diagnosing-bugs**).
- Is part of it already implemented, or made moot by a later change (an RN/native-SDK bump, a new arch path)?
- Does the codebase contradict the issue's assumptions? Check both JS and the relevant native side.
- Does it touch the public API surface (barrel / options) or the bridge ABI? That raises the stakes and the review bar.

Surface any contradiction to the user before going further — a spec built on a false premise wastes the whole pipeline.

## 4. Grill the gaps

Interview relentlessly until the intent is unambiguous. **One question at a time**, waiting for the answer before the next — batching is bewildering. Give your **recommended answer** with each question. If a question can be answered by reading the code, read it instead of asking. Drive out scope, edge cases, and the in-vs-out boundary — for this SDK that usually includes: which platforms/architectures are in scope, whether it's opt-in or default-on, PII implications, and whether downstream SDKs are affected.

## 5. Write the spec and get sign-off

Produce, in the conversation:

- **Problem** — what's wrong or missing, and why it matters.
- **Outcome** — the desired end state, in the domain's words.
- **Acceptance criteria** — verifiable, observable conditions (e.g. "an event captured with X carries attribute Y on both New and Old Architecture"; "the native module missing → SDK returns a fallback, no throw"). This is the bar `review`'s Spec axis checks against.
- **Non-goals** — what's explicitly out of scope (platforms, arch, options deferred).
- **Open questions** — anything still unresolved.

Done when the user **signs off on the acceptance criteria** — explicit agreement that meeting them means the work is complete. Not "looks reasonable"; agreement on the bar.

## 6. Hand off

The *what* is now settled. This spec becomes the PR description's problem / outcome / acceptance at ship time, and `review`'s Spec axis verifies against it. Hand off to **design-first** to shape the *how*.
