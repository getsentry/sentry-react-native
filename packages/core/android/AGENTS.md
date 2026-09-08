# packages/core/android — Java & Kotlin

> **Depth lives in the skills.** `code-guidelines` (`.agents/skills/`, esp. `references/native-bridge.md`) is authoritative for bridge and native conventions — load it before non-trivial work. This file is the quick reference for the Android surface; where a convention here overlaps a skill, the skill wins.

## Formatting & Linting

| Task | Command |
|------|---------|
| Java format (Google Java Format) | `yarn fix:android` |
| Kotlin format (ktlint) | `yarn fix:kotlin` |
| Java lint check | `yarn lint:android` |
| Kotlin lint check | `yarn lint:kotlin` |
| PMD static analysis | `yarn java:pmd` |

## Code Conventions

### Java

- Use **Google Java Format** (enforced by CI)
- Package structure: `io.sentry.react.*`
- Null safety: Use `@Nullable` and `@NonNull` annotations

### Kotlin

- Use **ktlint** formatting (enforced by CI)
- Prefer Kotlin idioms (data classes, extension functions, etc.)

## Architecture Variants

Android native code supports both React Native architectures — a bridge-method change usually has to land in **both**:

- `src/oldarch/` — Legacy bridge implementation
- `src/newarch/` — TurboModule / Fabric implementation
- `src/main/` — Shared code (`io.sentry.react`)

## Native Bridge Pattern (Java)

Catch `Throwable` at the boundary — not just `Exception`, so an `Error` can't crash the app either (the module code catches `Throwable` throughout) — and reject with the shared `"SentryReactNative"` code, not a per-method one:

```java
@ReactMethod
public void nativeOperation(String param, Promise promise) {
  try {
    boolean result = performOperation(param);
    promise.resolve(result);
  } catch (Throwable e) {
    promise.reject("SentryReactNative", e.getMessage(), e);
  }
}
```

## Boundaries

**✅ Always**
- Land a bridge-method change in **both** `src/oldarch/` and `src/newarch/` — one arch is not done.
- Catch `Throwable` at every `@ReactMethod` and `promise.reject(...)` — an uncaught throwable crashes the host app.
- Gate any user data added to events/breadcrumbs/spans on `sendDefaultPii`.

**🚫 Never**
- Change the codegen bridge ABI without mirroring it in JS + iOS and keeping it backward-compatible with an older cached native binary.
- Bump the bundled `io.sentry:sentry-android` version by hand — go through `scripts/update-android.sh`.

## Working with Local sentry-java

1. Build sentry-java: `cd sentry-java && make dryRelease`
2. Add `mavenLocal()` to sample's `android/build.gradle`
3. Update version to locally published version
