#import "SentrySDKWrapper.h"
#import "RNSentrySwiftBridge.h"
#import <Sentry/SentryProfilingConditionals.h>
@import Sentry;

@implementation SentrySDKWrapper

+ (void)captureEvent:(SentryEvent *)event
{
    [SentrySDK captureEvent:event];
}

+ (void)crash
{
    [SentrySDK crash];
}

+ (void)close
{
    [SentrySDK close];
}

+ (BOOL)crashedLastRun
{
    return [SentrySDK crashedLastRun];
}

+ (void)pauseAppHangTracking
{
    [SentrySDK pauseAppHangTracking];
}

+ (void)resumeAppHangTracking
{
    [SentrySDK resumeAppHangTracking];
}

+ (void)startProfiler
{
#if SENTRY_TARGET_PROFILING_SUPPORTED
    [SentrySDK startProfiler];
#endif
}

+ (void)stopProfiler
{
#if SENTRY_TARGET_PROFILING_SUPPORTED
    [SentrySDK stopProfiler];
#endif
}

+ (void)configureScope:(void (^)(SentryScope *scope))callback
{
    [SentrySDK configureScope:callback];
}

+ (BOOL)debug
{
    return RNSentryInternal.options.debug;
}

+ (NSString *)releaseName
{
    return RNSentryInternal.options.releaseName;
}

@end
