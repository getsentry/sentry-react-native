#ifndef RNSentrySwiftBridge_h
#define RNSentrySwiftBridge_h

// Imports the Objective-C interface of our Swift sources (`ios/Swift/`), where
// `RNSentryInternal` bridges sentry-cocoa's Swift-only `SentrySDK.internal.*`
// surface to `.m`/`.mm` callers.
//
// The module the generated header belongs to depends on how the SDK is built:
//
// * CocoaPods compiles Swift and Objective-C into the single `RNSentry` pod
//   module, so the header is `<RNSentry/RNSentry-Swift.h>`.
// * Swift Package Manager cannot mix languages in one target, so the Swift
//   sources build as a separate `RNSentrySwift` module. Its generated header
//   is reachable as a Clang module rather than a file on the header search
//   path, so it is imported by module name, selected by the
//   `RN_SENTRY_SWIFTPM` define that `Package.swift` sets.
//
// The unprefixed fallback covers targets that compile the sources directly
// without a module (for example the Xcode project in `ios/`).
//
// Only `.m` files may include this header: `@import` is rejected in
// Objective-C++. `.mm` callers use `RNSentryInternalWrapper` instead.
#if RN_SENTRY_SWIFTPM
@import RNSentrySwift;
#elif __has_include(<RNSentry/RNSentry-Swift.h>)
#    import <RNSentry/RNSentry-Swift.h>
#else
#    import "RNSentry-Swift.h"
#endif

#endif /* RNSentrySwiftBridge_h */
