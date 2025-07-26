#import "SentrySDKWrapper.h"
@import Sentry;

@implementation SentrySDKWrapper

+ (void)startWithOptions:(SentryOptions *)options
{
    [SentrySDK startWithOptions:options];
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

+ (void)configureScope:(void (^)(SentryScope *scope))callback
{
    [SentrySDK configureScope:callback];
}

@end
