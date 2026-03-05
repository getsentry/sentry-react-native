# packages/core/android — Java & Kotlin

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

Android native code supports both old and new React Native architectures:
- `src/oldarch/` — Legacy bridge implementation
- `src/newarch/` — TurboModule / Fabric implementation
- `src/main/` — Shared code

## Native Bridge Pattern (Java)

```java
@ReactMethod
public void nativeOperation(String param, Promise promise) {
  try {
    boolean result = performOperation(param);
    promise.resolve(result);
  } catch (Exception e) {
    promise.reject("OPERATION_FAILED", "Operation failed: " + e.getMessage(), e);
  }
}
```

## Working with Local sentry-java

1. Build sentry-java: `cd sentry-java && make dryRelease`
2. Add `mavenLocal()` to sample's `android/build.gradle`
3. Update version to locally published version
