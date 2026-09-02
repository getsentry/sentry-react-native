# Native bridge & codegen gotchas

Reference for the JS↔native seam. Loaded by **code-guidelines** and cited by **review**'s Correctness axis. The living, file-level detail is in [`packages/core/AGENTS.md`](../../../../packages/core/AGENTS.md) — this doc is the durable checklist.

## The two architectures

React Native ships two module systems and this SDK supports both:

- **New Architecture** — JSI / TurboModules (JS spec in `src/js/NativeRNSentry.ts`) + Fabric components. Codegen generates the C++/Java/ObjC glue from the TS spec. Native side: `ios/RNSentry.mm`, `android/src/newarch/`.
- **Old Architecture** — the async bridge, `NativeModules.RNSentry`. Native side: `android/src/oldarch/`. Legacy auto-instrumentation of third-party modules is opt-in (`enableLegacyNativeModules`) and best-effort.

A change is only "done" when it works on **both** archs. `Platform`/arch branches (`isTurboModuleEnabled()`, `isFabricEnabled()`) are the usual seams — test both branches.

## Codegen type vocabulary (New Arch)

Codegen only understands a narrow set of types in a `TurboModule` / component spec:

- Primitives: `boolean`, `number`, `string`
- `Object` — an **untyped** map (opaque `NSDictionary`/`ReadableMap`); the shape is *not* checked
- Arrays of the above
- Nullability via `?` on the property/param
- `Promise<T>` return

Not supported: literal unions, enums, generics, `Record<K, V>`, tuples, discriminated unions, function-valued props (except event callbacks on components), `undefined` as a value. If a method needs a richer shape, declare the param as `Object` and validate/normalize on the native side — the type system will *not* catch a mismatch for you.

## Serialization across the bridge

Everything crossing the bridge is serialized to a JSON-ish value:

- **No** functions, class instances, `Symbol`, `BigInt`, `undefined` holes, circular references, or `Map`/`Set`. These are dropped, throw, or arrive mangled.
- `undefined` object properties do not survive; use `null` or omit the key.
- Large payloads (envelopes, screenshots, replay frames) cross as base64/byte arrays — mind the copy cost and size limits.
- Always confirm the value **round-trips**: what you send is what native receives and what comes back parses. Add a serialization test for any new payload shape.

## ABI / versioning

- Any edit to `src/js/NativeRNSentry.ts` (or a `*NativeComponent.ts` spec) is a **bridge ABI change**. It must land in lockstep in the JS spec, `ios/RNSentry.mm`, and `android/.../RNSentryModuleImpl`, and must be **backward compatible**: a user can ship new JS against an older cached native binary. New methods are safe; changing an existing method's signature/semantics is breaking.
- Treat spec changes like public-API changes — they belong in the changelog and may be semver-major.

## Memory & crash safety

- **Android:** release JNI local refs; resolve *or* reject every `Promise` on every path (a leaked Promise hangs the JS caller). Never let a native exception propagate uncaught across the bridge.
- **iOS:** avoid retain cycles in blocks (`__weak` self); honor nullability annotations; route hybrid-SDK access through `RNSentryInternal`.
- A native crash caused by the SDK crashes the **host app** — the highest-severity failure this SDK can cause. Catch at the bridge boundary; degrade, don't crash.

## Privacy at the bridge

Data flowing from native (device context, breadcrumbs, module/method names, deep-link URLs) must respect `sendDefaultPii`. Any always-on collection needs an explicit, documented justification (see `packages/core/AGENTS.md` "Privacy" for the TurboModule exception and why it exists).

## Quick checklist for a bridge change

- [ ] Works on New **and** Old Architecture (both branches exercised)
- [ ] Spec change (if any) landed in JS + iOS + Android in lockstep, backward-compatible
- [ ] Payload is codegen-expressible or validated as `Object` on the native side
- [ ] Payload round-trips (serialization test added)
- [ ] Native failure is caught at the boundary — no host-app crash, no leaked Promise, no leaked native memory
- [ ] PII gated on `sendDefaultPii` (or documented exception)
- [ ] Graceful fallback when `enableNative` is false / module not linked
