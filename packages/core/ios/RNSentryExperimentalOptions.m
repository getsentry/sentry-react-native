#import "RNSentryExperimentalOptions.h"
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
    sentryOptions.experimental.enableLogs = enabled;
}

@end
