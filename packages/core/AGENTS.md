# packages/core — TypeScript/JavaScript SDK

> **Depth lives in the skills.** The `code-guidelines` and `test-guidelines` skills (`.agents/skills/`) hold the authoritative, current guidance on code style, API/integration design, the bridge, and tests — load them before non-trivial work. This file covers the package's build/test commands, quick-reference conventions, and the **TurboModule subsystem**, which is documented nowhere else. Where a convention here overlaps a skill, the skill wins.

## Build & Test

```bash
yarn build:sdk:watch   # Watch mode for development
yarn test:watch        # Jest watch mode
yarn test:sdk          # SDK tests only
yarn test:tools        # Tools tests only
```

## Code Style

- **Single quotes** for strings
- **Arrow functions** preferred for callbacks
- **async/await** is allowed (React Native bundle size isn't a concern)
- Use **optional chaining** (`?.`) and **nullish coalescing** (`??`)
- Maximum line length: **120 characters**
- Trailing commas: **always**
- Arrow parens: **avoid** when possible (`x => x` not `(x) => x`)

## Type Annotations

- Explicitly type function parameters and return types
- Use TypeScript strict mode conventions
- Prefer `interface` over `type` for object shapes
- Use `unknown` instead of `any` when possible

```typescript
interface UserData {
  id: string;
  name: string;
  email?: string;
}

const processUser = (user: UserData): string => {
  return user.email ?? 'no-email@example.com';
};
```

## Import Ordering

1. External packages (e.g., `@sentry/core`, `react-native`)
2. Internal absolute imports
3. Relative imports
4. Type imports (can be inline with `import type`)

## Test Naming Convention

Use `describe/it` blocks (preferred) or flat `test()` calls:

```typescript
describe('functionName', () => {
  it('returns expected value when input is valid', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = functionName(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

## Test Code Style

**Arrange-Act-Assert pattern** — always structure tests with clear sections.

**Use specific Jest matchers:**

```typescript
// Good
expect(value).toBe(true);
expect(array).toHaveLength(3);
expect(object).toMatchObject({ key: 'value' });
expect(fn).toThrow(Error);
expect(promise).resolves.toBe('success');

// Avoid
expect(value === true).toBe(true);
expect(array.length).toBe(3);
```

**Mock cleanup:**

```typescript
describe('MyComponent', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
});
```

## Common Patterns

> Diagnostics use **`debug`** from `@sentry/core`, not `logger` — `logger` is the Logs API and emits log *events* (and recurses in the bridge hot path). See *TurboModule Instrumentation* below.

### Error Handling

```typescript
import { debug } from '@sentry/core';

try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  debug.error('Operation failed', error);
  // Don't throw - log and return fallback
  return fallbackValue;
}
```

### Native Bridge (JS side)

```typescript
import { NativeModules } from 'react-native';

const { RNSentry } = NativeModules;

export async function nativeOperation(param: string): Promise<boolean> {
  if (!RNSentry) {
    debug.warn('Native module not available');
    return false;
  }

  try {
    return await RNSentry.nativeOperation(param);
  } catch (error) {
    debug.error('Native operation failed', error);
    return false;
  }
}
```

### Platform-Specific Code

```typescript
import { Platform } from 'react-native';

const platformSpecificValue = Platform.select({
  ios: 'iOS value',
  android: 'Android value',
  default: 'Default value',
});
```

### Mocking Native Modules in Tests

```typescript
jest.mock('react-native', () => ({
  NativeModules: {
    RNSentry: {
      nativeOperation: jest.fn(() => Promise.resolve(true)),
    },
  },
  Platform: {
    OS: 'ios',
  },
}));
```

## TurboModule Instrumentation

There are **two independent stacks** with confusingly similar names. Read this
before touching either.

### 1. JS stack — live, on by default

Wraps native module methods in JS. This is what produces every user-visible
TurboModule signal today. Registered in `integrations/default.ts` whenever
`options.enableNative` is `true`, with no separate opt-in.

Data flow, in call order:

| File | Role |
|------|------|
| `turbomodule/wrapTurboModule.ts` | `wrapTurboModule(name, module, { skip, arch })` — replaces each method with a timing wrapper. De-dupes via a module-level `WeakSet`. Walks the prototype chain (`Object.getPrototypeOf`) because JSI HostObject proxies expose nothing as own properties. |
| `turbomodule/turboModuleTracker.ts` | LIFO stack of in-flight calls, mirrored onto the **isolation scope** (that is what `enableSyncToNative` forwards to native). This is the crash-attribution frame. Writes `contexts.turbo_module` plus the `turbo_module.name` / `turbo_module.method` tags. |
| `turbomodule/turboModuleAggregator.ts` | O(1) counters per `(module, method, kind, arch)` plus a fixed-bucket latency histogram (`HISTOGRAM_BUCKETS_MS`). Fans out to record/call-start observers. |
| `turbomodule/wrapNativeModules.ts` | Old Architecture `NativeModules.*` auto-wrap. Returns `[]` immediately when `isTurboModuleEnabled()`. Opt-in via `enableLegacyNativeModules`. |
| `integrations/turboModuleContext.ts` | Wiring: integration `name` is `'TurboModuleContext'`, factory is `turboModuleContextIntegration()`. Owns `TurboModuleContextOptions` and all defaults. |
| `integrations/turboModuleContextFlush.ts` | Drains the aggregate onto transaction events (child span + measurements) and onto a periodic standalone event. |

Gotchas, all of which have already caused bugs:

- **Never wrap the scope-sync methods on `RNSentry`.** `RNSENTRY_SKIP` in
  `turboModuleContext.ts` excludes `setTag`, `setContext`, `addBreadcrumb`,
  `setUser` and friends. Wrapping them recurses: recording a call syncs the
  scope, which calls back into the wrapped method.
- **`RNSentry` is in the default `ignoreTurboModules`** for the same reason —
  the SDK's own transport calls would dominate the aggregate and re-arm the
  periodic flush timer forever.
- **`logger` imported from `@sentry/core` is the Logs API, not the debug
  logger.** `@sentry/core` exports `logger` as `./logs/public-api` and the
  debug logger as `debug`. The 7 `logger.warn` calls in `wrapTurboModule.ts`
  and 2 in `wrapNativeModules.ts` therefore capture log *events* from the wrap
  hot path, recursing through the wrapped `RNSentry.captureEnvelope`. **Use
  `debug` in new code here**; the pre-existing calls are a known bug.
- **Crash attribution pops synchronously**, even for async calls. Holding the
  frame until completion that may never arrive would blame this module for an
  unrelated later native crash.
- **A method with no completion signal is recorded as ~0ms.** Only a plain
  return and a thenable return are recognised. Fire-and-forget bridge methods
  that report completion through a trailing callback return `undefined`, so they
  close on return and land in the aggregate as sync calls with a near-zero
  duration. Tracked in
  [#6542](https://github.com/getsentry/sentry-react-native/issues/6542).

Tests: `test/turbomodule/*.test.ts` and `test/integrations/turboModuleContext.test.ts`.

### 2. Native stack — installed, inert

Gated by the `enableTurboModuleTracking` option (`src/js/options.ts`).

- `cpp/SentryTurboModulePerfLogger.{h,cpp}` — a
  `facebook::react::NativeModulePerfLogger` subclass that claims React Native's
  perf-logger slot and forwards every callback to a swappable sink.
- `cpp/SentryTurboModulePerfSink.h` — the `ISentryTurboModulePerfSink`
  interface.
- Install points: `ios/RNSentry.mm`, `android/.../RNSentryModuleImpl.java`,
  `android/src/main/jni/OnLoad.cpp`.

**The SDK ships no production sink.**
`SentryTurboModulePerfController::setSink` is only ever called from
`RNSentryCocoaTester/.../RNSentryTurboModulePerfControllerTests.mm`, so
`enableTurboModuleTracking: true` currently forwards every callback into
`nullptr` and emits nothing. The option is `@internal` for that reason.

The two stacks do **not** talk to each other. `turboModuleContextIntegration`
never reads `enableTurboModuleTracking`, and nothing in JS consumes the native
perf-logger callbacks. If you are adding a consumer, register a sink — do not
route it through the JS wrapper.

### Emitted keys

Two namespaces, which is a known inconsistency:

- `turbo_module.*` — scope context, event tags, root-span attributes
  (`turboModuleContext.ts`).
- `turbo_modules.*` — aggregate child-span data and measurements
  (`turboModuleContextFlush.ts`), plus the span op `turbo_modules.aggregate`
  and origin `auto.tracing.turbo_modules`.

Per-`(module, method)` keys embed the dynamic segment in the middle
(`turbo_module.<name>.<method>.call_count`). `safeKeyPart` escapes `_` to `__`
then `.` to `_` so a module name cannot forge a key boundary.

Both the namespace split and the mid-key dynamic segment are **not registrable
in [sentry-conventions](https://github.com/getsentry/sentry-conventions)**,
whose schema only models a trailing `has_dynamic_suffix`. Unifying them is
tracked in [#6168](https://github.com/getsentry/sentry-react-native/issues/6168).
Do not add new keys under either prefix until that lands — conventions must be
merged *before* an SDK ships an attribute, and renaming a shipped name costs a
90-day `backfill` deprecation cycle.

### Old Architecture support policy

The legacy `NativeModules` path (`enableLegacyNativeModules`) is **opt-in and
best-effort**, and stays that way while React Native still ships the Old
Architecture. It is not deprecated and has no removal timeline. Unlike the New
Architecture path, which only sees modules the app actually imports, it
instruments every registered bridge module including third-party ones — hence
the opt-in and the `IMPLICIT_MODULE_SKIP` list in `wrapNativeModules.ts`
(`RNSentry`, `Timing`, `UIManager`, and the animated modules).

### Privacy

Native module and method names are app-defined identifiers and are sent by
default — in tags, in `contexts.turbo_module`, in span attributes and in slow
call breadcrumbs — **regardless of `sendDefaultPii`**. This is deliberate: the
crash-attribution frame is the reason the integration is default-on. Users who
need to reduce it can pass `ignoreTurboModules`, or disable
`enableAggregateStats` / `enableSpanAttribution`.
