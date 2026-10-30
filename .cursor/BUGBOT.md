# PR Review Guidelines for Cursor Bot

**Scope & intent**

- High-level review guidance for the entire Sentry React Native SDK monorepo.
- Optimize for **signal over noise**: only comment when there's material correctness, security/privacy, performance, or API-quality impact.
- If you find anything to flag, mention that you flagged this in the review because it was mentioned in this rules file.
- Do not flag the issues below if they appear only in tests (unless covered by Testing conventions below).
- These rules operationalize the Sentry SDK [philosophy](https://develop.sentry.dev/sdk/getting-started/philosophy/) and [principles](https://develop.sentry.dev/sdk/getting-started/principles/): protect customer apps and data, prefer safe defaults, keep the base SDK lean, stay compatible, and never let SDK or callback failures become Sentry traffic or host crashes.

**Reviewer style**

- Be concise. Quote exact lines/spans and propose a minimal fix (tiny diff/code block).
- If something is subjective, ask a brief question rather than asserting.
- Prefer principles over nitpicks; avoid noisy style-only comments that don't impact behavior.
- Limit to high-confidence findings; no drive-by refactors unrelated to the diff.

---

## 0) Critical Issues to Flag

> Use a clear prefix like **CRITICAL:** in the review comment title.

### A. Security & Privacy

- **Secrets / credentials exposure**: Keys, tokens, DSNs, endpoints, or auth data in code, logs, tests, configs, or example apps.
- **PII handling**: New code that logs or sends user-identifiable data without clear intent and controls. These must be gated behind the `sendDefaultPii` flag.
- **Unsafe logging**: Request/response bodies, full URLs with query secrets, file paths or device identifiers logged by default.
- **File/attachments**: Large or sensitive payloads attached by default; lack of size limits or backoff.
- **Debug code shipped**: Diagnostics, sampling overrides, verbose logging, or feature flags accidentally enabled in production defaults.

### B. Public API & Stability

- **Breaking changes**: Signature/behavior changes, renamed/removed symbols, altered nullability/defaults, or event/telemetry shape changes **without** deprecation/migration notes.
- **Behavioral compatibility**: Silent changes to defaults, sampling, or feature toggles that affect existing apps.
- **Native bridge compatibility**: Changes to native module method signatures (iOS `RCT_EXPORT_METHOD` / Android `@ReactMethod`) must be backward-compatible or versioned, as they affect all consumers including Expo and bare React Native apps.
- **Support floor drops**: Raising min RN/iOS/Android/JS engine versions, or dropping a supported platform, without explicit docs/changelog/migration callout.

### C. Dependency Updates

- **Native SDK updates**: For PRs prefixed with `chore(deps):` updating native SDKs (e.g., `chore(deps): bump sentry-cocoa to v9.x.x`, `chore(deps): bump sentry-android to v8.x.x`):
  - Read the PR description which should contain the changelog.
  - Review mentioned changes for potential compatibility issues in the current codebase.
  - Flag breaking API changes, deprecated features being removed, new requirements, or behavioral changes that could affect existing integrations.
  - Check if version bumps require corresponding changes in the native bridge code (Objective-C/Swift on iOS, Java/Kotlin on Android).
- **JavaScript dependency updates**: For PRs updating JS/TS dependencies, check for breaking API changes that affect the SDK's public surface or internal usage.
- **New baseline dependencies**: Flag new runtime dependencies on the base SDK path. Integration-only optional deps are fine when justified; baseline deps increase license, maintenance, and supply-chain surface.

---

## 1) General Software Quality

**Clarity & simplicity**

- Prefer straightforward control flow, early returns, and focused functions.
- Descriptive names; avoid unnecessary abbreviations.
- Keep public APIs minimal and intentional.

**Correctness & safety**

- Add/update tests with behavioral changes and bug fixes. Tests must prove user-visible or SDK behavior (payloads, contracts), not merely coverage or "did not throw".
- Handle error paths explicitly; never let a Sentry instrumentation error crash the host app. Prefer graceful degrade / no-op when a path cannot safely run.
- Avoid global mutable state; prefer immutability and clear ownership.
- Do not capture exceptions thrown inside the SDK itself or inside user callbacks (`beforeSend`, `tracesSampler`, and similar). Swallow gracefully and emit an error-level SDK log — capturing here can loop. See [Never capture your own exceptions](https://develop.sentry.dev/sdk/getting-started/principles/#never-capture-your-own-exceptions).

**DRY & cohesion**

- Remove duplication where it reduces complexity; avoid over-abstraction.
- Keep modules cohesive; avoid reaching across layers for convenience.

**Performance (pragmatic)**

- Prefer linear-time approaches; avoid unnecessary allocations/copies.
- Don't micro-optimize prematurely—call out obvious hotspots or regressions.
- Be mindful of main-thread work in React Native; offload heavy work to native threads where possible.

---

## 2) TypeScript/JavaScript-Specific

**Idioms & language features**

- Use optional chaining (`?.`) and nullish coalescing (`??`) over manual null checks.
- Avoid `any`; prefer `unknown` with explicit narrowing.
- Use `async/await` over raw Promises for readability.
- Follow the existing single-quote string style and 120-character line limit.

**Safety & async**

- Wrap `NativeModules` calls in try/catch; native bridges can throw.
- Ensure Promises are handled; avoid unhandled rejections.
- Check that `NativeModules.RNSentry` exists before calling methods (module may not be linked).

**Tree-shakeability**

- Avoid patterns that defeat tree shaking (e.g., side-effectful top-level code).
- Use named exports; avoid re-exporting entire namespaces unnecessarily.
- Instantiate optional integrations lazily (inside guarded branches).

---

## 3) React Native Bridge (Native Modules)

**iOS (Objective-C / Swift)**

- New `RCT_EXPORT_METHOD` / `RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD` must have a corresponding JS implementation.
- Prefer `RCTPromiseResolveBlock`/`RCTPromiseRejectBlock` over synchronous returns for non-trivial work.
- Wrap native calls in `@try/@catch` and reject the promise with a meaningful error code.
- Nullability annotations (`nullable`/`nonnull`) must be consistent with JS-side expectations.
- New Objective-C classes must use the `RNSentry` prefix.

**Android (Java / Kotlin)**

- New `@ReactMethod` entries must have a corresponding JS implementation.
- Use `Promise` for async operations; call `promise.resolve()` or `promise.reject()` exactly once.
- Avoid blocking the JS thread; offload heavy work to background threads.
- Add `@Nullable` / `@NonNull` annotations consistently.
- New classes must live under `io.sentry.react.*`.

**TurboModules / New Architecture**

- Changes to the native module spec (`NativeSentry.ts` or equivalent) must be reflected in both the legacy and new architecture implementations.
- Verify that new methods are added to the codegen spec so they work with TurboModules.

---

## 4) SDK-Specific (high-level)

**Tracing & spans**

- Any span started must be **closed** (including on error paths).
- For _automated_ instrumented spans, always set:
  - `sentry.origin` — only `[a-zA-Z0-9_.]`; flag non-conforming values ([trace origin](https://develop.sentry.dev/sdk/telemetry/traces/trace-origin/))
  - `sentry.op` — lowercase snake_case segments joined by `.` where applicable ([span ops](https://develop.sentry.dev/sdk/telemetry/traces/span-operations/))
- If attribute values are known at span start, set them via start-span `attributes` rather than immediate follow-up `setAttribute` calls, so samplers / ignore rules see full context.
- When instrumentation catches errors: prefer letting user errors propagate. Flag swallowing without capture, and capture that would double-report an error still bubbling to the app.
- When calling `captureException` (or equivalent) for user/app errors, set mechanism `handled` and a stable `type` identifying the integration/site.

**Structured logs**

- For _automated_ instrumented structured logs, always set `sentry.origin`.

**Initialization & error paths**

- Wrap dangerous or failure-prone paths (especially during `Sentry.init`) in `try/catch`, add actionable context, and ensure fallbacks keep the app usable.
- Never let SDK initialization failure crash the host application.

**Replay & sensitive data**

- Any new UI instrumentation must respect the masking/unmasking API.
- Default to masking sensitive views; opt-in to unmasking.

**Defaults & OOTB**

- Prefer auto-enabling integrations when safe; flag new required config that could reasonably default.
- Avoid heavy in-SDK transforms of wire-format data when rawer collection + server-side processing would do.

---

## 5) Testing conventions

- `feat` PRs: prefer at least one integration or E2E test covering the new behavior.
- `fix` PRs: prefer a regression test that fails without the fix and passes with it; if unclear from the diff, ask the author.
- Flag likely flakes: sleep/timeouts instead of signals; start-wait-after-act instead of register-wait-then-act; multi-request waits that assume a hard order.

---

## 6) What NOT to flag

- Pure style/formatting owned by linters (`yarn lint` / platform formatters)
- Speculative refactors or cleanup with no clear user benefit or linked motivation
- Idiomatic native bridges / low-level hooks solely for being "non-pure" — only flag when unsafe or host-harmful
- Test-only issues outside Testing conventions
- Conventional commit format when CI already validates it

---

## Quick reviewer checklist

- [ ] **CRITICAL:** No secrets/PII/logging risks introduced; safe defaults preserved.
- [ ] **CRITICAL:** Public API/telemetry stability maintained or properly deprecated with docs.
- [ ] **CRITICAL:** For dependency updates (`chore(deps):`), changelog reviewed for breaking changes or compatibility issues.
- [ ] Native bridge methods (iOS & Android) are consistent with JS-side calls and handle errors safely.
- [ ] TurboModule/New Architecture spec updated if native module interface changed.
- [ ] Spans started are always closed; automated spans/logs include `sentry.origin` (+ valid `sentry.op` for spans).
- [ ] Dangerous init paths guarded; app remains usable on failure.
- [ ] No SDK-own / callback exception capture (no self-capture loops).
- [ ] `captureException` sets mechanism; instrumentation does not swallow or double-report.
- [ ] `NativeModules.RNSentry` existence checked before use; async bridge calls wrapped in try/catch.
- [ ] Tests prove behavior (feat/fix bar); docs/CHANGELOG updated for behavior changes.
