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

## Swift Package Manager (`../Package.swift`)

React Native 0.87+ can autolink through SwiftPM instead of CocoaPods, so the
package ships a `Package.swift` next to `RNSentry.podspec`. Both describe the
same sources; keep them in sync.

Three SwiftPM constraints shape the layout — don't undo them by moving files:

- **No mixed-language targets.** Swift lives in `ios/Swift/` and compiles as the
  separate `RNSentrySwift` target. `.m` files import its generated interface
  through `ios/RNSentrySwiftBridge.h`, never `<RNSentry/RNSentry-Swift.h>`
  directly — that spelling only exists under CocoaPods.
- **No Swift module in Objective-C++.** Under SwiftPM the Swift interface is
  only reachable as a Clang module, and `@import` is rejected in `.mm` files
  (enabling C++ modules breaks React Native's C++ headers). So `.mm` callers go
  through `RNSentryInternalWrapper`, a plain Objective-C forwarder that mirrors
  `RNSentryInternal` selector for selector. Add a member there when a `.mm`
  file needs a new one; don't include the bridge header from `.mm`.
- **No header maps.** The public headers are mirrored as forwarding headers in
  `ios/include/RNSentry/`, which is the target's `publicHeadersPath`, so
  `#import <RNSentry/RNSentrySDK.h>` keeps working. Add a mirror for every new
  public header (and to `s.public_header_files`); the podspec excludes the
  directory so CocoaPods doesn't see two headers per name.
- **A target's whole directory is scanned for resources.** Every target points
  at one source directory (`ios`, `ios/Swift`, `cpp`) rather than the package
  root, which would pick up a local `node_modules` or Xcode build output and
  fail to resolve.

The autolinked target name must stay `RNSentry`, because it is also the prefix
consumers import headers under. It is pinned in both places React Native looks:
`spm.name` in `react-native.config.js` (0.87) and `swiftpmConfig.name` in
`package.json` (0.88+).

## Internal API access (`SentrySDK.internal`)

RNSentry consumes sentry-cocoa's hybrid-SDK surface (`SentrySDK.internal.*`)
through a Swift bridge in `RNSentryInternal.swift`. The bridge imports Sentry
with `@_spi(Private)` because several sub-APIs (`performance.currentScreenFrames`,
`replay.configure`, `envelope.{store,capture,deserialize}`) are SPI-gated.
`.m`/`.mm` callers import the auto-generated `RNSentry-Swift.h` and route
through `[RNSentryInternal …]` instead of accessing sentry-cocoa internals
directly.
