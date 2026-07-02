// This file exists to force Xcode to link the Swift runtime compatibility
// libraries (e.g. libswiftCompatibility56, libswiftCompatibilityConcurrency)
// into RNSentry. Those libs are required by our vendored `Sentry.xcframework`
// static Swift library and Xcode only auto-links them when the consuming
// target itself contains Swift code — without this stub, linking a dynamic
// RNSentry framework fails with:
//   Undefined symbols: "__swift_FORCE_LOAD_$_swiftCompatibility56"

// A private, unused constant so the compiler emits a real object file. A
// pure-comment file compiles to nothing and would defeat the purpose of
// the stub.
private let _rnSentrySwiftLinkStub: Void = ()
