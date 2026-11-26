# Review checks: unchanged behavior and spec notes

Two checks a reviewer asks for beyond the claim. Both are reported **outside the verdict**: "Verified" still means only that the claim holds.

## Unchanged behavior

A fix can work and still change something next to it. Check up to **two** nearby paths on the same two builds and expect the **same** evidence on both sides.

### Picking the paths (step 1)

Read the diff for code the change reaches besides the fix:

| In the diff | Path to check |
|---|---|
| A changed function with other callers | One other caller's scenario (`grep -rn '<function>' packages/core/src packages/core/ios packages/core/android`) |
| A new condition or early return | The other branch: the input that skips the new code |
| A new option | The default (option unset): what happened before must still happen |
| A wrapped or patched handler | The case the wrapper should pass through untouched (e.g. a non-fatal through a new fatal path) |
| A changed event field | Another event type that sets the same field |
| A restored or added breadcrumb or span | The other sources of the same list on the same event (other breadcrumb categories) |

Prefer paths the code reaches on **both** sides. When the "without" side never reaches the changed code (e.g. a handler that returned early), every check there is trivially the same: say so in the row, and look for a path where the old code still runs. Pick paths the sample can trigger in the same run, without a third build. A path that needs a different SDK option (tracing on instead of off) needs a third build, unless the sample already reads that option from a launch argument. Skip those and list them under "Not covered". Write each one down with its expectation: "<scenario>: <evidence>, same on both sides".

Review questions passed in as input (see SKILL.md, *Inputs*) are candidates for these checks. Turn each into a scenario with an expected result, or list it as not checked and why. A question is something to test, never a conclusion: the report answers it from the evidence.

### Running them

Add the paths to the same flow, after the main scenario or in a second flow on the same build, with the same run tags. Use a distinct message or button per path so its events can be told apart.

### Reporting them

One row per path in "Also checked, expected unchanged": the scenario, the evidence on each side (with the event count when the count is the point, e.g. "exactly 1 event"), and **Same** or **Changed**. Answer each review question in one line under the table. A **Changed** row doesn't change the verdict. Describe the difference and whether the PR mentions it; the maintainer decides.

## Spec notes

When the PR **adds or changes** a field on what the SDK sends, compare the value actually sent (read from the "with" event, not from the diff) with the published spec:

| Field | Where to look |
|---|---|
| `exception.mechanism` (`type`, `handled`, `synthetic`) | https://develop.sentry.dev/sdk/telemetry/errors/ (*Exception Mechanism*, *Mechanism Type Naming*) |
| Event contexts, tags, `sdk` | https://develop.sentry.dev/sdk/foundations/envelopes/event-payloads/ |
| Span `op`, `origin`, span or log attribute names | https://conventions.sentry.dev/ (attributes) and https://develop.sentry.dev/sdk/telemetry/traces/ |
| Envelope items, attachments (`attachment_type`) | https://develop.sentry.dev/sdk/foundations/envelopes/envelope-items/ and https://develop.sentry.dev/sdk/telemetry/attachments/ |
| Logs, metrics | https://develop.sentry.dev/sdk/telemetry/logs/ and https://develop.sentry.dev/sdk/telemetry/metrics/ |

Fetch the page; don't answer from memory. The develop docs move pages: if a link is dead, start from https://develop.sentry.dev/sdk/ and put the URL you used in the note. For plain Markdown, replace the page URL's trailing slash with `.md` (`…/telemetry/errors.md`, not `…/errors/.md`). Then write one note per field: the value sent, what the spec says, and the URL. When the spec gives no guidance, say so. When it disagrees, say how, without a verdict.

Only fields the PR introduces or changes, including an existing value the PR puts on a new event (e.g. reusing `onerror` for a new path). Fields the event already had, and fields the PR restores unchanged, are out of scope, even if they look wrong.
