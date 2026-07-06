#import "SentryScreenFramesWrapper.h"
#if __has_include(<RNSentry/RNSentry-Swift.h>)
#    import <RNSentry/RNSentry-Swift.h>
#else
#    import "RNSentry-Swift.h"
#endif
@import Sentry;

#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST

@implementation SentryScreenFramesWrapper

+ (BOOL)canTrackFrames
{
    return RNSentryInternal.currentScreenFrames != nil;
}

+ (NSNumber *)totalFrames
{
    if (![self canTrackFrames]) {
        return nil;
    }
    return [NSNumber numberWithLong:RNSentryInternal.currentScreenFrames.total];
}

+ (NSNumber *)frozenFrames
{
    if (![self canTrackFrames]) {
        return nil;
    }
    return [NSNumber numberWithLong:RNSentryInternal.currentScreenFrames.frozen];
}

+ (NSNumber *)slowFrames
{
    if (![self canTrackFrames]) {
        return nil;
    }
    return [NSNumber numberWithLong:RNSentryInternal.currentScreenFrames.slow];
}

+ (NSNumber *)framesDelayForStartTimestamp:(double)startTimestampSeconds
                              endTimestamp:(double)endTimestampSeconds
{
    SentryFramesTracker *framesTracker = [[SentryDependencyContainer sharedInstance] framesTracker];

    if (!framesTracker.isRunning) {
        return nil;
    }

    id<SentryCurrentDateProvider> dateProvider =
        [SentryDependencyContainer sharedInstance].dateProvider;
    uint64_t currentSystemTime = [dateProvider systemTime];
    NSTimeInterval currentWallClock = [[dateProvider date] timeIntervalSince1970];

    double startOffsetSeconds = currentWallClock - startTimestampSeconds;
    double endOffsetSeconds = currentWallClock - endTimestampSeconds;

    if (startOffsetSeconds < 0 || endOffsetSeconds < 0
        || (uint64_t)(startOffsetSeconds * 1e9) > currentSystemTime
        || (uint64_t)(endOffsetSeconds * 1e9) > currentSystemTime) {
        return nil;
    }

    uint64_t startSystemTime = currentSystemTime - (uint64_t)(startOffsetSeconds * 1e9);
    uint64_t endSystemTime = currentSystemTime - (uint64_t)(endOffsetSeconds * 1e9);

    SentryFramesDelayResultSPI *result = [framesTracker getFramesDelaySPI:startSystemTime
                                                       endSystemTimestamp:endSystemTime];

    if (result != nil && result.delayDuration >= 0) {
        return @(result.delayDuration);
    }
    return nil;
}

@end

#endif // TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
