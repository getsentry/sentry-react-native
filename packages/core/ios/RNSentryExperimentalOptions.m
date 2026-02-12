#import "RNSentryExperimentalOptions.h"
#import <Sentry/SentryProfilingConditionals.h>
@import Sentry;

@implementation RNSentryExperimentalOptions

+ (void)setEnableUnhandledCPPExceptionsV2:(BOOL)enabled sentryOptions:(SentryOptions *)sentryOptions
{
    if (sentryOptions == nil) {
        return;
    }
    sentryOptions.experimental.enableUnhandledCPPExceptionsV2 = enabled;
}

+ (BOOL)getEnableUnhandledCPPExceptionsV2:(SentryOptions *)sentryOptions
{
    if (sentryOptions == nil) {
        return NO;
    }
    return sentryOptions.experimental.enableUnhandledCPPExceptionsV2;
}

+ (void)setEnableLogs:(BOOL)enabled sentryOptions:(SentryOptions *)sentryOptions
{
    if (sentryOptions == nil) {
        return;
    }
    sentryOptions.enableLogs = enabled;
}

+ (void)setEnableSessionReplayInUnreliableEnvironment:(BOOL)enabled
                                        sentryOptions:(SentryOptions *)sentryOptions
{
    if (sentryOptions == nil) {
        return;
    }
    sentryOptions.experimental.enableSessionReplayInUnreliableEnvironment = enabled;
}

+ (void)configureProfilingWithOptions:(NSDictionary *)profilingOptions
                        sentryOptions:(SentryOptions *)sentryOptions
{
#if SENTRY_TARGET_PROFILING_SUPPORTED
    if (sentryOptions == nil || profilingOptions == nil) {
        return;
    }

    sentryOptions.configureProfiling = ^(SentryProfileOptions *_Nonnull profiling) {
        // Set session sample rate
        id profileSessionSampleRate = profilingOptions[@"profileSessionSampleRate"];
        if (profileSessionSampleRate != nil &&
            [profileSessionSampleRate isKindOfClass:[NSNumber class]]) {
            profiling.sessionSampleRate = [profileSessionSampleRate floatValue];
            NSLog(@"Sentry: UI Profiling sessionSampleRate set to: %.2f",
                profiling.sessionSampleRate);
        }

        // Set lifecycle mode
        NSString *lifecycle = profilingOptions[@"lifecycle"];
        if ([lifecycle isKindOfClass:[NSString class]]) {
            if ([lifecycle caseInsensitiveCompare:@"manual"] == NSOrderedSame) {
                profiling.lifecycle = SentryProfileLifecycleManual;
                NSLog(@"Sentry: UI Profiling Lifecycle set to MANUAL");
            } else if ([lifecycle caseInsensitiveCompare:@"trace"] == NSOrderedSame) {
                profiling.lifecycle = SentryProfileLifecycleTrace;
                NSLog(@"Sentry: UI Profiling Lifecycle set to TRACE");
            }
        }

        // Set profile app starts
        id startOnAppStart = profilingOptions[@"startOnAppStart"];
        if (startOnAppStart != nil && [startOnAppStart isKindOfClass:[NSNumber class]]) {
            profiling.profileAppStarts = [startOnAppStart boolValue];
            NSLog(@"Sentry: UI Profiling profileAppStarts set to %@",
                profiling.profileAppStarts ? @"YES" : @"NO");
        }
    };
#endif
}

@end
