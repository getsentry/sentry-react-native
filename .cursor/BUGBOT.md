# PR Review Guidelines for Cursor Bot

**Scope & intent**

- High-level review guidance for the entire Sentry React Native SDK monorepo.
- Optimize for **signal over noise**: only comment when there's material correctness, security/privacy, performance, or API-quality impact.
- If you find anything to flag, mention that you flagged this in the review because it was mentioned in this rules file.
- Do not flag the issues below if they appear only in tests.

**Reviewer style**

- Be concise. Quote exact lines/spans and propose a minimal fix (tiny diff/code block).
- If something is subjective, ask a brief question rather than asserting.
- Prefer principles over nitpicks; avoid noisy style-only comments that don't impact behavior.

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

### C. Dependency Updates

- **Native SDK updates**: For PRs prefixed with `chore(deps):` updating native SDKs (e.g., `chore(deps): bump sentry-cocoa to v9.x.x`, `chore(deps): bump sentry-android to v8.x.x`):
  - Read the PR description which should contain the changelog.
  - Review mentioned changes for potential compatibility issues in the current codebase.
  - Flag breaking API changes, deprecated features being removed, new requirements, or behavioral changes that could affect existing integrations.
  - Check if version bumps require corresponding changes in the native bridge code (Objective-C/Swift on iOS, Java/Kotlin on Android).
- **JavaScript dependency updates**: For PRs updating JS/TS dependencies, check for breaking API changes that affect the SDK's public surface or internal usage.

---

## 1) General Software Quality

**Clarity & simplicity**

- Prefer straightforward control flow, early returns, and focused functions.
- Descriptive names; avoid unnecessary abbreviations.
- Keep public APIs minimal and intentional.

**Correctness & safety**

- Add/update tests with behavioral changes and bug fixes.
- Handle error paths explicitly; never let a Sentry instrumentation error crash the host app.
- Avoid global mutable state; prefer immutability and clear ownership.

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
  - `sentry.origin`
  - `sentry.op` using a standard operation where applicable (see [Sentry's list of standard ops](https://develop.sentry.dev/sdk/telemetry/traces/span-operations/)).

**Structured logs**

- For _automated_ instrumented structured logs, always set `sentry.origin`.

**Initialization & error paths**

- Wrap dangerous or failure-prone paths (especially during `Sentry.init`) in `try/catch`, add actionable context, and ensure fallbacks keep the app usable.
- Never let SDK initialization failure crash the host application.

**Replay & sensitive data**

- Any new UI instrumentation must respect the masking/unmasking API.
- Default to masking sensitive views; opt-in to unmasking.

---

## Quick reviewer checklist

- [ ] **CRITICAL:** No secrets/PII/logging risks introduced; safe defaults preserved.
- [ ] **CRITICAL:** Public API/telemetry stability maintained or properly deprecated with docs.
- [ ] **CRITICAL:** For dependency updates (`chore(deps):`), changelog reviewed for breaking changes or compatibility issues.
- [ ] Native bridge methods (iOS & Android) are consistent with JS-side calls and handle errors safely.
- [ ] TurboModule/New Architecture spec updated if native module interface changed.
- [ ] Spans started are always closed; automated spans/logs include `sentry.origin` (+ valid `sentry.op` for spans).
- [ ] Dangerous init paths guarded; app remains usable on failure.
- [ ] `NativeModules.RNSentry` existence checked before use; async bridge calls wrapped in try/catch.
- [ ] Tests/docs/CHANGELOG updated for behavior changes.
