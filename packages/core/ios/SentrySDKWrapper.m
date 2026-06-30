#import "SentrySDKWrapper.h"
#import "RNSentry-Swift.h"
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
