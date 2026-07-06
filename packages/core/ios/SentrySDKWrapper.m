#import "SentrySDKWrapper.h"
#if __has_include(<RNSentry/RNSentry-Swift.h>)
#    import <RNSentry/RNSentry-Swift.h>
#else
#    import "RNSentry-Swift.h"
#endif
@import Sentry;

@implementation SentrySDKWrapper

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
