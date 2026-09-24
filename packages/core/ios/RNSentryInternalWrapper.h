#import <Foundation/Foundation.h>

@class SentryEnvelope;
@class SentryId;

NS_ASSUME_NONNULL_BEGIN

/**
 * Objective-C++-safe mirror of `RNSentryInternal` (see `ios/Swift/`).
 *
 * `.mm` files cannot reach the Swift sources directly under Swift Package
 * Manager: the generated Objective-C interface is only available as a Clang
 * module, and `@import` is rejected in Objective-C++ unless C++ modules are
 * enabled — which React Native's C++ headers do not survive. So the `.mm`
 * callers go through this wrapper, whose implementation is plain Objective-C.
 *
 * Every member mirrors the `RNSentryInternal` selector of the same name, so the
 * two stay diffable. `.m` callers keep using `RNSentryInternal` directly
 * through `RNSentrySwiftBridge.h`.
 */
@interface RNSentryInternalWrapper : NSObject

// MARK: - SDK metadata

@property (class, readonly) NSString *sdkName;

@property (class, readonly) NSString *sdkVersionString;

@property (class, readonly) NSDictionary<NSString *, id> *extraContext;

@property (class, readonly) NSString *installationID;

// MARK: - Feature flags

+ (void)addFeatureFlag:(NSString *)name value:(BOOL)value;

// MARK: - App start and frames

@property (class, readonly, nullable) NSDictionary<NSString *, id> *appStartMeasurementWithSpans;

@property (class, readonly) BOOL isFramesTrackingRunning;

// MARK: - Envelopes

+ (nullable SentryEnvelope *)envelopeFromData:(nullable NSData *)data;

+ (void)capture:(SentryEnvelope *)envelope;

+ (void)store:(SentryEnvelope *)envelope;

// MARK: - Screenshots and view hierarchy

+ (void)setCurrentScreen:(nullable NSString *)screenName;

@property (class, readonly, nullable) NSArray<NSData *> *captureScreenshots;

@property (class, readonly, nullable) NSData *captureViewHierarchy;

// MARK: - Session replay

+ (BOOL)captureReplay;

+ (void)startReplay;

+ (void)startReplayBuffering;

+ (void)stopReplay;

+ (void)pauseReplay;

+ (void)resumeReplay;

+ (void)flushReplay;

@property (class, readonly, nullable) NSString *replayId;

+ (void)setReplayRedactContainerClass:(Class)containerClass;

+ (void)setReplayIgnoreContainerClass:(Class)containerClass;

// MARK: - Profiling

+ (uint64_t)startProfilerForTrace:(SentryId *)traceId;

+ (nullable NSDictionary<NSString *, id> *)collectProfileBetween:(uint64_t)startTime
                                                             and:(uint64_t)endTime
                                                        forTrace:(SentryId *)traceId;

+ (void)discardProfilerForTrace:(SentryId *)traceId;

// MARK: - Scope propagation context

+ (void)setCurrentScopePropagationContextWithTraceId:(NSString *)traceId spanId:(NSString *)spanId;

@end

NS_ASSUME_NONNULL_END
