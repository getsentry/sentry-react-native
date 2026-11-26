# Evidence: what to check and how to find it

## Pick the evidence first

Choose the signal that differs between the two runs, and write the expectation for each side before running.

| Claim is about… | Evidence | How to look it up |
|---|---|---|
| Event content (tags, contexts, extras, stack trace, mechanism) | The error event of each run | `search_errors` by `verify.run_id`, then open the event (below) |
| A crash the change prevents | A crash event without the change; none with it, **plus** proof the scenario ran (screenshot, logcat line, a later event from the same run) | `search_errors` by run id; `adb logcat -d \| grep "FATAL EXCEPTION"` |
| Logs | Log entries of each run | `search_logs` (recipe below). Delivery alone may not separate the runs: in the #6967 run, a native `Sentry.logger()` call was delivered with logs disabled |
| Spans, transactions, measurements | The transaction of each run | `search_traces` / `get_trace_details`; add the run id as a tag before the transaction starts |
| Profiles | Profile chunks of each run | `search_profiles` by time window; open from the transaction |
| Screenshots, view hierarchy, other attachments | The attachment on each run's event, read back from Sentry — not the device's own screenshot | `get_event_attachment` with the event id (lists them), then with the `attachmentId` (returns the image). Save both images with the report |
| Masking (screenshots, replay) | A **probe** the mask must hide: a view that is neither text nor an image (so default masking leaves it alone) in two contrasting colors (a redaction is one flat color) | as above; describe what each run's image shows |
| Replays | The replay on the run's event | the event's `replays.attached` field; `get_replay_details` for the timeline |
| Replay recording content (touches, frames) | The rrweb events in each segment. The MCP's replay timeline shows only breadcrumbs (e.g. `tap`), not recorded touch positions | Android with `debug: true`: logcat holds each segment's full rrweb JSON (touches are `type 3`, `source 2`). Android Spotlight doesn't forward replay envelopes |
| Breadcrumbs (touch, navigation, …) | The breadcrumb list of an event from each run | `get_issue_breadcrumbs` with the issue id and `eventId`; `get_sentry_resource` on the event doesn't return them. It truncates `data` (~300 characters), so read long values (a touch `path`) from logcat with `debug: true` |
| A JS-thread block or hang | The hang event; a device-log line the scenario prints after the block | screenshots show only the tap |
| Trace linking between the JS and native layers | `contexts.trace.trace_id` of a JS event and a native event (e.g. a native crash) from the **same process**: capture the JS event first, then crash. Equal or different | open both events; logcat (`debug: true`) shows the native scope's trace at startup and when it changes |
| Native SDK started without the React Native setup | The native event's `sdk.name` (`sentry.java.android.react-native` / `sentry.cocoa.react-native` when the React Native options were applied, the plain native name when not) and React Native tags such as `event.origin` | the event detail; logcat for errors from the options callback during init |
| Option mapping, native init | The **resolved option on device**, logged by the scenario (e.g. `ScopesAdapter.getInstance().getOptions().getLogs().isEnabled()`); the option's effect in Sentry is secondary | logcat, or put the value in the message/tag the run sends. Mind the sample's init path (SKILL.md step 1.3) |
| Performance (startup, allocation) | Usually not checkable end to end on an emulator | Say so and mark **Inconclusive** rather than measuring noise |

An absence ("tag missing", "no crash") only counts when the same run also shows the scenario ran.

## Sentry MCP sequence

Org `sentry-sdks`, region `https://us.sentry.io`, project `sentry-react-native`.

1. **Search** — `search_errors`:
   ```
   organizationSlug: sentry-sdks
   regionUrl: https://us.sentry.io
   query: verify.run_id:<id>
   period: 1h
   fields: ["id", "title", "issue", "timestamp", "tags[verify.commit]"]
   ```
   Events usually show up within a minute of the relaunch. Repeat every ~30 s; after **5 minutes** with nothing, the run is Inconclusive (check logcat for `Envelope sent successfully` / rate limits first).
2. **Open** — `get_sentry_resource` with `url: https://sentry-sdks.sentry.io/issues/<issue short id>/events/<event id>/`. Looking up a bare event id (`resourceType: event`) fails with "No issue found".
3. **Read** the `tags` and `contexts` in the event detail.

## Logs

`search_logs` rejects `verify.run_id` ("Unknown attribute"), and a wildcard on the run id alone returned nothing. What worked:

1. The scenario logs a message with a fixed prefix plus the run id, e.g. `verify-pr log <run id> ...`.
2. `search_logs` with `message:"*<fixed prefix>*"`, `period: 1h`; pick the entry whose message holds the run id.
3. Wait ~20 s after the flow before the first lookup: logs are batched on device.

## Links for the report

| Evidence | Link |
|---|---|
| Error event | `https://sentry-sdks.sentry.io/issues/<short id>/events/<event id>/` |
| Log entry | `https://sentry-sdks.sentry.io/explore/logs/?project=-1&logsPinned=<log id>` |

## Pitfalls

- **Discover can't tell missing from empty.** A `tags[x]` column shows `""` for both. In the event detail, a tag the SDK sent as `""` appears with `value: null` (ingestion dropped it); a tag never sent is absent.
- **Processing errors aren't visible through the MCP.** The event's `errors` list (e.g. "Discarded invalid value") isn't returned. Use indirect evidence (a `null` tag value) and say so in the report. Reading it needs a token with `event:read`.
- **Dropped by the sample's filter.** `ignoreErrors` in the sample's `App.tsx` drops JS-processed events whose message contains "should" or the digit 2; a missing event may never have been sent. Events captured natively don't go through it.
- **Stale events.** The sample keeps unsent envelopes across launches. Use a fresh run id per attempt and launch with `clearState: true`.
- **Grouping.** Both runs' events may land in the same, long-lived issue, and the same scenario groups differently per platform (`Sentry.nativeCrash()` is a Java `RuntimeException` on Android and an `EXC_BAD_ACCESS` on iOS). Link the **events**, not the issue.
- **Attachment download URLs carry a token** (`os_auth=`). Copy the image next to the report and never paste the URL into a report: the repos are public.
