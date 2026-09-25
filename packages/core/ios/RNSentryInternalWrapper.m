#import "RNSentryInternalWrapper.h"
#import "RNSentrySwiftBridge.h"

@implementation RNSentryInternalWrapper

// MARK: - SDK metadata

+ (NSString *)sdkName
{
    return RNSentryInternal.sdkName;
}

+ (NSString *)sdkVersionString
{
    return RNSentryInternal.sdkVersionString;
}

+ (NSDictionary<NSString *, id> *)extraContext
{
    return [RNSentryInternal extraContext];
}

+ (NSString *)installationID
{
    return RNSentryInternal.installationID;
}

// MARK: - Feature flags

+ (void)addFeatureFlag:(NSString *)name value:(BOOL)value
{
    [RNSentryInternal addFeatureFlag:name value:value];
}

// MARK: - App start and frames

+ (NSDictionary<NSString *, id> *)appStartMeasurementWithSpans
{
    return [RNSentryInternal appStartMeasurementWithSpans];
}

+ (BOOL)isFramesTrackingRunning
{
    return RNSentryInternal.isFramesTrackingRunning;
}

// MARK: - Envelopes

+ (SentryEnvelope *)envelopeFromData:(NSData *)data
{
    return [RNSentryInternal envelopeFromData:data];
}

+ (void)capture:(SentryEnvelope *)envelope
{
    [RNSentryInternal capture:envelope];
}

+ (void)store:(SentryEnvelope *)envelope
{
    [RNSentryInternal store:envelope];
}

// MARK: - Screenshots and view hierarchy

#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST

+ (void)setCurrentScreen:(NSString *)screenName
{
    [RNSentryInternal setCurrentScreen:screenName];
}

+ (NSArray<NSData *> *)captureScreenshots
{
    return [RNSentryInternal captureScreenshots];
}

+ (NSData *)captureViewHierarchy
{
    return [RNSentryInternal captureViewHierarchy];
}

#endif

// MARK: - Session replay

+ (BOOL)captureReplay
{
    return [RNSentryInternal captureReplay];
}

+ (void)startReplay
{
    [RNSentryInternal startReplay];
}

+ (void)startReplayBuffering
{
    [RNSentryInternal startReplayBuffering];
}

+ (void)stopReplay
{
    [RNSentryInternal stopReplay];
}

+ (void)pauseReplay
{
    [RNSentryInternal pauseReplay];
}

+ (void)resumeReplay
{
    [RNSentryInternal resumeReplay];
}

+ (void)flushReplay
{
    [RNSentryInternal flushReplay];
}

+ (NSString *)replayId
{
    return [RNSentryInternal replayId];
}

+ (void)setReplayRedactContainerClass:(Class)containerClass
{
    [RNSentryInternal setReplayRedactContainerClass:containerClass];
}

+ (void)setReplayIgnoreContainerClass:(Class)containerClass
{
    [RNSentryInternal setReplayIgnoreContainerClass:containerClass];
}

// MARK: - Profiling

+ (uint64_t)startProfilerForTrace:(SentryId *)traceId
{
    return [RNSentryInternal startProfilerForTrace:traceId];
}

+ (NSDictionary<NSString *, id> *)collectProfileBetween:(uint64_t)startTime
                                                    and:(uint64_t)endTime
                                               forTrace:(SentryId *)traceId
{
    return [RNSentryInternal collectProfileBetween:startTime and:endTime forTrace:traceId];
}

+ (void)discardProfilerForTrace:(SentryId *)traceId
{
    [RNSentryInternal discardProfilerForTrace:traceId];
}

// MARK: - Scope propagation context

+ (void)setCurrentScopePropagationContextWithTraceId:(NSString *)traceId spanId:(NSString *)spanId
{
    [RNSentryInternal setCurrentScopePropagationContextWithTraceId:traceId spanId:spanId];
}

@end
