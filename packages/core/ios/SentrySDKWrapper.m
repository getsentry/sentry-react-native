#import "SentrySDKWrapper.h"
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
    return PrivateSentrySDKOnly.options.debug;
}

+ (NSString *)releaseName
{
    return PrivateSentrySDKOnly.options.releaseName;
}

@end
