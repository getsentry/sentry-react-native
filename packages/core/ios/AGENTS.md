# packages/core/ios — Objective-C & Swift

> **Depth lives in the skills.** `code-guidelines` (`.agents/skills/`, esp. `references/native-bridge.md`) is authoritative for bridge and native conventions — load it before non-trivial work. This file is the quick reference for the iOS surface; where a convention here overlaps a skill, the skill wins.

## Formatting & Linting

| Task | Command |
|------|---------|
| ObjC/C++ format (clang-format) | `yarn fix:clang` |
| Swift format (swiftlint) | `yarn fix:swift` |
| ObjC/C++ lint check | `yarn lint:clang` |
| Swift lint check | `yarn lint:swift` |

## Code Conventions

### Objective-C

- Use **clang-format** (enforced by CI)
- Prefix classes with **`RNSentry`**
- Use nullability annotations (`nullable`, `nonnull`)

### Swift

- Use **swiftlint** (enforced by CI)
- Follow Swift API design guidelines

## Native Bridge Pattern (Objective-C)

Catch everything at the boundary and reject — never let an exception reach the app. The reject error code is the shared `@"SentryReactNative"`, not a per-method code:

```objc
RCT_EXPORT_METHOD(nativeOperation:(NSString *)param
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    BOOL result = [self performOperation:param];
    resolve(@(result));
  } @catch (NSException *exception) {
    reject(@"SentryReactNative", exception.reason, nil);
  }
}
```

## Boundaries

**✅ Always**
- Resolve or reject every exported method — a `Promise` left neither resolved nor rejected hangs the JS caller.
- Catch native exceptions at the bridge — an exception that reaches the app crashes it.
- Gate any user data added to events/breadcrumbs/spans on `sendDefaultPii`.

**🚫 Never**
- Reach for `PrivateSentrySDKOnly` from new code — route hybrid-SDK access through `RNSentryInternal` (see below).
- Bump the bundled sentry-cocoa version by hand — go through `scripts/update-cocoa.sh`.

## Working with Local sentry-cocoa

1. Build sentry-cocoa: `cd sentry-cocoa && make init`
2. Edit `RNSentry.podspec` to remove version constraint
3. Add local pod to sample's Podfile:
   ```ruby
   pod 'Sentry', :path => '../../../../sentry-cocoa'
   ```

## Internal API access (`SentrySDK.internal`)

RNSentry consumes sentry-cocoa's hybrid-SDK surface (`SentrySDK.internal.*`)
through a Swift bridge in `RNSentryInternal.swift`. The bridge imports Sentry
with `@_spi(Private)` because several sub-APIs (`performance.currentScreenFrames`,
`replay.configure`, `envelope.{store,capture,deserialize}`) are SPI-gated.
`.m`/`.mm` callers import the auto-generated `RNSentry-Swift.h` and route
through `[RNSentryInternal …]` instead of accessing sentry-cocoa internals
directly.
