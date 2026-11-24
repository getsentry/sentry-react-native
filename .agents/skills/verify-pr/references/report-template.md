# Report template

Keep it short. Fill every section; write "none" rather than dropping one.

```markdown
# Verification: #<N> <PR title> — <Verified | Not reproduced | Failed | Inconclusive>

**Claim:** <one sentence: what was broken or missing, what should be true now>
**Platform:** Android <version> emulator (<AVD>), <New | Old> Architecture, <release | debug> build
**Scenario flow:** `.agents/skills/verify-pr/flows/scenarios/<file>.yml`

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

Attempts: <failed builds or runs, why, and time lost — or "first try">

## Human intervention

<every step a human had to do, and why — or "none">

## Problems

<flaky or failed steps, workarounds, skill gaps — or "none">
```
