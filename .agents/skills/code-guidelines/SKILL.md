---
name: code-guidelines
description: Enforce Sentry React Native SDK code guidelines for implementation, refactoring, and review. Use when implementing features, adding functionality, refactoring, reviewing code, designing APIs, changing the public API surface (the `packages/core/src/js/index.ts` barrel), handling breaking changes, deprecating options, writing integrations, touching the JS↔native bridge, or making architecture decisions in this yarn-workspaces monorepo.
---

Apply these guidelines to all new and modified code in `packages/core`. Existing code may not follow these conventions — do not refactor it unless asked.

This SDK spans **four surfaces**: TypeScript/JS (`packages/core/src/js/`), Android (Java/Kotlin, `packages/core/android/`), iOS (ObjC/Swift, `packages/core/ios/`), and the **JS↔native bridge** (`RNSentry` TurboModule / legacy NativeModule) that connects them. Read the `AGENTS.md` for the surface you're touching — root, `packages/core/`, `packages/core/android/`, `packages/core/ios/` — before writing. The bridge is where most SDK-specific bugs live; the deep guidance for it is in [`packages/core/AGENTS.md`](../../../packages/core/AGENTS.md).

For non-trivial work — a new feature or integration, a public barrel-file change, or a change that crosses the native bridge — load the **design-first** skill to shape the modules and seams before writing code. When writing or modifying tests, also load the **test-guidelines** skill.

## SDK Development Rules

### Integrations

SDK features are packaged as **integration factory functions** that return an `Integration` (from `@sentry/core`). See `src/js/integrations/` for the canonical shape (e.g. `nativelinkederrors.ts`):

```typescript
const INTEGRATION_NAME = 'MyFeature';

export const myFeatureIntegration = (options: Partial<MyOptions> = {}): Integration => {
  return {
    name: INTEGRATION_NAME,
    setupOnce: () => { /* one-time global side effects, if any */ },
    setup: (client: Client) => { /* per-client wiring */ },
    processEvent: (event, hint, client) => { /* enrich/drop */ return event; },
  };
};
```

- **Check prerequisites and feature flags early** — if the feature is disabled or the native module is missing, log via `debug` and return without wiring anything up.
- Name the integration with a module-level `INTEGRATION_NAME` constant; don't inline the string.
- Integrations should be **order-independent**. If yours must run before/after another, reconsider the design.
- Register default integrations in `src/js/integrations/default.ts`; keep an integration's options and defaults with the integration, not scattered across `options.ts`.
- Clean up anything global (listeners, timers) — an integration that arms a timer or subscribes to an emitter must have a path that tears it down.

### Native Bridge (JS side)

Every call into native goes through the `NATIVE` wrapper (`src/js/wrapper.ts`) / `RNSentry` TurboModule. Rules:

- **Guard on availability.** If `enableNative` is false or the module isn't linked, degrade gracefully — return a safe fallback, never throw into user code.
- **Never let a native rejection escape.** Wrap bridge calls; log via `debug` and return a fallback. A thrown promise rejection from the bridge becomes an unhandled rejection in the host app.
- **Everything crossing the bridge must be serializable** — plain JSON (no functions, class instances, `undefined` holes, circular refs, or `BigInt`). Both the New Architecture (JSI/TurboModule codegen) and the legacy bridge serialize payloads; a non-serializable value is silently dropped or throws on the native side. Verify `toJSON`/normalization round-trips.
- **Do not wrap `RNSentry`'s own scope-sync methods** (`setTag`, `setContext`, `addBreadcrumb`, `setUser`, `captureEnvelope`, …). Wrapping them recurses — see the `RNSENTRY_SKIP` / `ignoreTurboModules` notes in `packages/core/AGENTS.md`.
- In this hot path, `logger` from `@sentry/core` is the **Logs API** (emits log events), not the debug logger. Use **`debug`** for diagnostics — see the TurboModule section of `packages/core/AGENTS.md`.

### Native Bridge (native side)

- **Android** (`packages/core/android/`): resolve/reject the `Promise` on every path; never leak it. Release JNI local refs; don't let a native exception cross back into the bridge uncaught. Old vs new arch code lives in `src/oldarch/` and `src/newarch/`; shared code in `src/main/`.
- **iOS** (`packages/core/ios/`): prefix classes `RNSentry`; use nullability annotations; watch for retain cycles in blocks (capture `weakSelf`). Route hybrid-SDK access through `RNSentryInternal` (see `packages/core/ios/AGENTS.md`), not deprecated `PrivateSentrySDKOnly`.
- A native exception must **never crash the host app** — catch at the bridge boundary and reject/log instead.

### Codegen (New Architecture)

The bridge spec is codegen'd. `src/js/NativeRNSentry.ts` is the `TurboModule` spec; `RNSentryReplayMask*NativeComponent.ts` are Fabric component specs.

- Codegen only supports a **restricted type vocabulary** — primitives, `Object` (untyped map), arrays, and nullable via `?`. No unions of literals, no generics, no `Record<K,V>` with non-string keys. If a method's shape can't be expressed, pass an `Object` and validate/parse on the native side.
- Any change to a `Native*.ts` spec is a **bridge ABI change**: it must land in lockstep across the JS spec, `ios/RNSentry.mm`, and the Android `RNSentryModuleImpl`, and stay backward-compatible with older native binaries a user may have cached. Treat it like a public API change.

### Usage tracking & SDK metadata

The event's [SDK interface](https://develop.sentry.dev/sdk/data-model/event-payloads/sdk/) carries `sdk.integrations`, `sdk.packages`, and an optional `sdk.features` list; the spec says a feature should be reported through **either** an integration **or** the `features` list, not both. RN takes the *integrations* route: unlike sentry-dart (which populates `sdk.features` via an explicit `addFeature` / `SentryFeatures` API), RN's `@sentry/core` reports usage only through `event.sdk.integrations` and does **not** populate `sdk.features`. So usage is reported implicitly:

- An **installed integration is auto-reported by its `name`** — `@sentry/core` collects the names of installed integrations into `event.sdk.integrations`. So the practical rule is: give the integration a stable, correct `INTEGRATION_NAME`, and register it (a default in `integrations/default.ts`, or `client.addIntegration(...)`) — that registration *is* the usage signal. A feature that runs without a registered, named integration is invisible to usage tracking.
- **SDK identity/packages** come from `src/js/version.ts` (`SDK_NAME`, `SDK_PACKAGE_NAME`, `SDK_VERSION`) surfaced by `integrations/sdkinfo.ts`, which also appends the native SDK package — not the place to register feature usage.
- Do **not** confuse this with `addFeatureFlag` on the native module (`wrapper.ts` / `NativeRNSentry.ts`) — that is the user-facing **feature-flags** product, unrelated to SDK usage tracking.

When adding something you want measured, make sure it lands as a named, registered integration rather than a bare side effect.

### Logging

- **`debug`** (from `@sentry/core`) is the internal diagnostic logger — use it for all SDK diagnostics. It is tree-shaken / gated so it stays quiet in production.
- **`logger`** (from `@sentry/core`) is the **Logs API** — it emits user-visible log *events*. Never use it for internal diagnostics, and never in a hot path (see bridge rules above).
- Log at the right level: `debug` for lifecycle/config, `warn` for recoverable/degraded paths (native module missing, option ignored), `error` for failures that affect SDK behavior.

### Privacy (PII)

- **Never collect PII without gating on `options.sendDefaultPii`.** This covers IP inference, device identifiers, deep-link URLs, navigation params, request/response bodies, and user-supplied context.
- Flag any change that could place user data into breadcrumbs, event payloads, span attributes, or logs for review.
- Deliberate exceptions exist and must be documented where they live (e.g. TurboModule module/method names are app-defined identifiers sent regardless of `sendDefaultPii` — see `packages/core/AGENTS.md` "Privacy"). Don't add new always-on data collection without that justification.

### Breaking changes

- The public API is the `src/js/index.ts` barrel plus every exported option in `options.ts`. Its shape is captured in the API report (`packages/core/etc/sentry-react-native.api.md`); regenerate with `yarn api-report` and check with `yarn api-report:check`.
- Removing or changing the signature/behavior of an exported symbol or option is a **semver-major breaking change**. Prefer **deprecation with a migration path** (`@deprecated` JSDoc + a working shim) over immediate removal.
- Bridge/ABI changes (see Codegen) are breaking even when the JS surface looks unchanged — an app can ship new JS against an older cached native binary.

### Adding dependencies

When adding or changing any third-party reference — an npm dependency, a `.vscode/extensions.json` recommendation, a GitHub Action (`uses:`), or a native dependency (Podfile / Gemfile / Gradle) — verify it is published by its legitimate owner **before** referencing it. The tool being real is not enough: the *namespace* must be one the project trusts. Prefer Sentry's own scope/org (`@sentry/*`, `getsentry/*`), then the artifact's documented official publisher, and pin to an exact version / full commit SHA rather than a floating tag. Treat an unscoped or unfamiliar-publisher name as a supply-chain risk until proven otherwise — a claimable namespace lets an attacker ship code to every contributor. See [references/supply-chain.md](references/supply-chain.md) for the surface-by-surface checklist and verification commands.

## File Organization

**Group by feature, not by type.** A processor or helper a feature owns lives with that feature (the TurboModule files sit together as `turbomodule/` + `integrations/turboModuleContext*.ts`). The `integrations/` directory is a **type-bucket** — it collects things that share the `Integration` type. Don't treat "it's an integration" as the whole home for a cohesive subsystem; keep the subsystem's own logic together and let the integration file be thin wiring.

Native code lives under `packages/core/android/` and `packages/core/ios/` and is reached only through the `NATIVE` wrapper seam — features *call* the bridge, they don't embed native code.

*Where* a given piece goes is a locality judgment — see **design-first**.

## TypeScript & API style

Shape the public surface deliberately (see **design-first** for module shape). In an SDK these matter more than in app code:

- **Private by default.** Don't export a symbol from the barrel unless it's genuinely part of the SDK's API — every export is a breaking-change liability and shows up in the API report.
- **Explicit types on public functions** — annotate parameters and return types; don't rely on inference across the API boundary.
- **`unknown` over `any`.** Narrow with type guards; `any` disables the checker exactly where SDK robustness matters.
- **Prefer `interface` for object shapes**; use `type` for unions/mapped types.
- **Optional chaining / nullish coalescing** (`?.`, `??`) over hand-rolled truthiness — but remember `??` and `?.` treat `0`/`''`/`false` correctly where `||` doesn't.
- **Re-throw, don't wrap-and-rethrow.** Preserve the original error and its stack; when adding context, attach a `cause` rather than replacing the error — stack-trace fidelity is the product.
- **No cross-boundary deep imports.** Import from `@sentry/core` / `@sentry/browser` public entry points, not their internal paths; keep RN-internal imports within `src/js`.

Style enforced by ESLint/oxlint/Prettier (single quotes, trailing commas, 120 cols, arrow-paren avoidance, import ordering) is **not** restated here — don't flag what `yarn lint` / `yarn fix` already handles. See `packages/core/AGENTS.md` for the list.

## Documentation comments

Prefer self-documenting code; comment for the two cases that earn it:

- **Public APIs** — JSDoc for every exported symbol and option, written for users who can't see the implementation.
- **Non-obvious *why*** — workarounds, ordering constraints, native-bridge quirks, RN-version differences. The reasoning, not the play-by-play.

Don't narrate obvious behavior or restate the code. Use `@deprecated`, `@internal`, and `@hidden` deliberately — `@internal`/`@hidden` keep a symbol out of the generated API surface even when it must be exported for cross-file use.
