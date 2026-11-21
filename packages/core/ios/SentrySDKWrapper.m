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

+ (void)setUser:(SentryUser *)user
{
    [SentrySDK configureScope:^(SentryScope *_Nonnull scope) { [scope setUser:user]; }];
}

+ (void)addBreadcrumb:(SentryBreadcrumb *)breadcrumb
{
    [SentrySDK configureScope:^(SentryScope *_Nonnull scope) { [scope addBreadcrumb:breadcrumb]; }];
}

+ (void)clearBreadcrumbs
{
    [SentrySDK configureScope:^(SentryScope *_Nonnull scope) { [scope clearBreadcrumbs]; }];
}

+ (void)setExtraValue:(id)value forKey:(NSString *)key
{
    [SentrySDK
        configureScope:^(SentryScope *_Nonnull scope) { [scope setExtraValue:value forKey:key]; }];
}

+ (void)setContextValue:(NSDictionary<NSString *, id> *)value forKey:(NSString *)key
{
    [SentrySDK configureScope:^(
        SentryScope *_Nonnull scope) { [scope setContextValue:value forKey:key]; }];
}

+ (void)removeContextForKey:(NSString *)key
{
    [SentrySDK configureScope:^(SentryScope *_Nonnull scope) { [scope removeContextForKey:key]; }];
}

+ (void)setTagValue:(NSString *)value forKey:(NSString *)key
{
    [SentrySDK
        configureScope:^(SentryScope *_Nonnull scope) { [scope setTagValue:value forKey:key]; }];
}

+ (void)setAttributeValue:(id)value forKey:(NSString *)key
{
    [SentrySDK configureScope:^(
        SentryScope *_Nonnull scope) { [scope setAttributeValue:value forKey:key]; }];
}

+ (void)setAttributes:(NSDictionary<NSString *, id> *)attributes
{
    [SentrySDK configureScope:^(SentryScope *_Nonnull scope) {
        [attributes enumerateKeysAndObjectsUsingBlock:^(
            NSString *key, id value, BOOL *stop) { [scope setAttributeValue:value forKey:key]; }];
    }];
}

+ (void)removeAttributeForKey:(NSString *)key
{
    [SentrySDK
        configureScope:^(SentryScope *_Nonnull scope) { [scope removeAttributeForKey:key]; }];
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
