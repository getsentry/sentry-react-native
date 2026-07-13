import Foundation
@_spi(Private) import Sentry

/// Thin Objective-C-visible bridge over `SentrySDK.internal.*`.
///
/// React Native's iOS code is mostly `.m`/`.mm`, but the new hybrid-SDK API
/// (`SentrySDK.internal`) is Swift-only and several methods are gated by
/// `@_spi(Private)`. This file imports with the SPI name and exposes a flat
/// `@objc` surface that mirrors the call sites we use today.
///
/// Platform gating mirrors each `SentryInternal*Api` in sentry-cocoa
/// (`Sources/Swift/HybridSDK/`). Where a sub-API is excluded on a platform,
/// stubs return safe defaults so `.m`/`.mm` callers still resolve symbols.
@_spi(Private) @objc public final class RNSentryInternal: NSObject {

    // MARK: - SDK metadata

    @_spi(Private) @objc public static var sdkName: String { SentrySDK.internal.sdk.name }

    @_spi(Private) @objc public static var sdkVersionString: String { SentrySDK.internal.sdk.versionString }

    @_spi(Private) @objc public static func setSdkName(_ name: String, version: String) {
        SentrySDK.internal.sdk.setName(name, version: version)
    }

    @_spi(Private) @objc public static func addSdkPackage(_ name: String, version: String) {
        SentrySDK.internal.sdk.addPackage(name: name, version: version)
    }

    @_spi(Private) @objc public static var extraContext: [String: Any] {
        SentrySDK.internal.sdk.extraContext
    }

    @_spi(Private) @objc public static var installationID: String {
        SentrySDK.internal.sdk.installationID
    }

    // MARK: - Options

    @_spi(Private) @objc public static var options: Options { SentrySDK.internal.options }

    @_spi(Private) @objc public static func options(fromDictionary dict: [String: Any]) throws -> Options {
        try SentrySDK.internal.options(fromDictionary: dict)
    }

    // MARK: - App start

    @_spi(Private) @objc public static var appStartMeasurementHybridSDKMode: Bool {
        get { SentrySDK.internal.appStart.hybridSDKMode }
        set { SentrySDK.internal.appStart.hybridSDKMode = newValue }
    }

    @_spi(Private) @objc public static var appStartMeasurementWithSpans: [String: Any]? {
        SentrySDK.internal.appStart.measurementWithSpans
    }

    // MARK: - Performance / frames

    #if os(iOS) || os(tvOS) || os(visionOS)
    @_spi(Private) @objc public static var framesTrackingMeasurementHybridSDKMode: Bool {
        get { SentrySDK.internal.performance.framesTrackingHybridSDKMode }
        set { SentrySDK.internal.performance.framesTrackingHybridSDKMode = newValue }
    }

    @_spi(Private) @objc public static var isFramesTrackingRunning: Bool {
        SentrySDK.internal.performance.isFramesTrackingRunning
    }

    @_spi(Private) @objc public static var currentScreenFrames: SentryScreenFrames? {
        SentrySDK.internal.performance.currentScreenFrames
    }
    #else
    @_spi(Private) @objc public static var framesTrackingMeasurementHybridSDKMode: Bool {
        get { false }
        set {}
    }

    @_spi(Private) @objc public static var isFramesTrackingRunning: Bool { false }

    // `currentScreenFrames` is intentionally NOT declared on non-UIKit
    // platforms: sentry-cocoa does not compile `SentryScreenFrames` there,
    // so referencing it as a return type would fail to resolve. Every ObjC
    // caller (`SentryScreenFramesWrapper.m`) is already gated to
    // `TARGET_OS_IPHONE || TARGET_OS_MACCATALYST`, so no consumer needs the
    // stub on macOS/watchOS.
    #endif

    // MARK: - Envelope

    // Accepts `Data?` (nil-safe) rather than `Data` so the ObjC bridge boundary
    // doesn't force-unwrap a nil `NSData*` from a failed base64 decode — that
    // would crash before we ever get a chance to check the result. Matches the
    // nil-tolerant behaviour of the deprecated `PrivateSentrySDKOnly.envelopeWithData:`.
    @_spi(Private) @objc public static func envelope(fromData data: Data?) -> SentryEnvelope? {
        guard let data = data else { return nil }
        return SentrySDK.internal.envelope.deserialize(from: data)
    }

    @_spi(Private) @objc public static func capture(_ envelope: SentryEnvelope) {
        SentrySDK.internal.envelope.capture(envelope)
    }

    @_spi(Private) @objc public static func store(_ envelope: SentryEnvelope) {
        SentrySDK.internal.envelope.store(envelope)
    }

    // MARK: - Screenshot / view hierarchy / screen

    // sentry-cocoa's `SentryInternalScreen/Screenshot/ViewHierarchyApi` are all
    // gated to `(os(iOS) || os(tvOS)) && !SENTRY_NO_UI_FRAMEWORK`. On visionOS
    // the new API surface is intentionally absent — so `setCurrentScreen` is a
    // no-op there, unlike the deprecated `PrivateSentrySDKOnly.setCurrentScreen`
    // (which worked under `SENTRY_UIKIT_AVAILABLE`, i.e. also on visionOS).
    // Callers on visionOS lose the current-screen breadcrumb enrichment as a
    // result; this matches the direction of sentry-cocoa's new hybrid API.
    #if os(iOS) || os(tvOS)
    @_spi(Private) @objc public static var captureScreenshots: [Data]? {
        SentrySDK.internal.screenshot.capture()
    }

    @_spi(Private) @objc public static var captureViewHierarchy: Data? {
        SentrySDK.internal.viewHierarchy.capture()
    }

    @_spi(Private) @objc public static func setCurrentScreen(_ screenName: String?) {
        SentrySDK.internal.screen.setCurrent(screenName)
    }
    #else
    @_spi(Private) @objc public static var captureScreenshots: [Data]? { nil }
    @_spi(Private) @objc public static var captureViewHierarchy: Data? { nil }
    @_spi(Private) @objc public static func setCurrentScreen(_ screenName: String?) {}
    #endif

    // MARK: - Replay

    #if os(iOS) || os(tvOS)
    @_spi(Private) @objc public static func captureReplay() -> Bool {
        SentrySDK.internal.replay.capture()
    }

    @_spi(Private) @objc public static var replayId: String? {
        SentrySDK.internal.replay.replayId
    }

    @_spi(Private) @objc public static func setReplayRedactContainerClass(_ containerClass: AnyClass) {
        SentrySDK.internal.replay.setRedactContainerClass(containerClass)
    }

    @_spi(Private) @objc public static func setReplayIgnoreContainerClass(_ containerClass: AnyClass) {
        SentrySDK.internal.replay.setIgnoreContainerClass(containerClass)
    }

    @_spi(Private) @objc public static func configureReplay(
        breadcrumbConverter: SentryReplayBreadcrumbConverter
    ) {
        SentrySDK.internal.replay.configure(
            breadcrumbConverter: breadcrumbConverter,
            screenshotProvider: nil
        )
    }
    #else
    @_spi(Private) @objc public static func captureReplay() -> Bool { false }
    @_spi(Private) @objc public static var replayId: String? { nil }
    @_spi(Private) @objc public static func setReplayRedactContainerClass(_ containerClass: AnyClass) {}
    @_spi(Private) @objc public static func setReplayIgnoreContainerClass(_ containerClass: AnyClass) {}
    @_spi(Private) @objc public static func configureReplay(
        breadcrumbConverter: SentryReplayBreadcrumbConverter
    ) {}
    #endif

    // MARK: - Swizzle

    // `SentryInternalSwizzleApi` in sentry-cocoa has no platform gating.
    // We enable the wrapper on every UIKit-capable platform (iOS/tvOS/visionOS
    // — matching `SENTRY_UIKIT_AVAILABLE`, which is what `SENTRY_HAS_UIKIT`
    // resolves to in the RNSentry.mm caller). `os(iOS)` in Swift already
    // covers Mac Catalyst, so no separate `targetEnvironment(macCatalyst)` is
    // needed.
    #if os(iOS) || os(tvOS) || os(visionOS)
    /// Stable identity for the `RNSScreen.viewDidAppear:` swizzle so the underlying
    /// `oncePerClass` bookkeeping in sentry-cocoa can dedupe re-entries.
    private static var rnsScreenViewDidAppearKey: UInt8 = 0

    /// Swizzles `-[RNSScreen viewDidAppear:]`, invoking `hook` before the original
    /// implementation on every call. No-op when RNSScreen is unavailable.
    @_spi(Private) @objc public static func swizzleRNSScreenViewDidAppear(hook: @escaping () -> Void) {
        guard let cls = NSClassFromString("RNSScreen") else { return }
        let selector = NSSelectorFromString("viewDidAppear:")

        // `withUnsafePointer(to:)` scopes the pointer's validity to the closure
        // body. Perform the entire swizzle call inside so we never rely on the
        // pointer surviving beyond the closure. The backing storage is a
        // `static var`, so the address itself stays stable across calls —
        // sentry-cocoa's `oncePerClass` bookkeeping continues to dedupe.
        withUnsafePointer(to: &rnsScreenViewDidAppearKey) { keyPtr in
            _ = SentrySDK.internal.swizzle.instanceMethod(
                selector,
                in: cls,
                mode: .oncePerClass,
                key: UnsafeRawPointer(keyPtr),
                factory: { getOriginal in
                    let block: @convention(block) (AnyObject, ObjCBool) -> Void = { receiver, animated in
                        hook()
                        typealias OriginalIMP = @convention(c) (AnyObject, Selector, ObjCBool) -> Void
                        let original = unsafeBitCast(getOriginal(), to: OriginalIMP.self)
                        original(receiver, selector, animated)
                    }
                    return block as AnyObject
                }
            )
        }
    }
    #else
    @_spi(Private) @objc public static func swizzleRNSScreenViewDidAppear(hook: @escaping () -> Void) {}
    #endif

    // MARK: - Profiling

    #if !(os(watchOS) || os(tvOS) || os(visionOS))
    @_spi(Private) @objc public static func startProfiler(forTrace traceId: SentryId) -> UInt64 {
        SentrySDK.internal.profiling.start(for: traceId)
    }

    @_spi(Private) @objc(collectProfileBetween:and:forTrace:)
    public static func collectProfile(
        between startTime: UInt64,
        and endTime: UInt64,
        forTrace traceId: SentryId
    ) -> [String: Any]? {
        SentrySDK.internal.profiling.collect(between: startTime, and: endTime, for: traceId)
    }

    @_spi(Private) @objc public static func discardProfiler(forTrace traceId: SentryId) {
        SentrySDK.internal.profiling.discard(for: traceId)
    }
    #else
    @_spi(Private) @objc public static func startProfiler(forTrace traceId: SentryId) -> UInt64 { 0 }
    @_spi(Private) @objc public static func collectProfile(
        between startTime: UInt64,
        and endTime: UInt64,
        forTrace traceId: SentryId
    ) -> [String: Any]? { nil }
    @_spi(Private) @objc public static func discardProfiler(forTrace traceId: SentryId) {}
    #endif
}
