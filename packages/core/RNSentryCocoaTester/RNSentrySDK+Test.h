#import "RNSentrySDK.h"
@import Sentry;

@interface RNSentrySDK (Test)

+ (void)start:(NSString *)path
    configureOptions:(void (^)(SentryOptions *_Nonnull options))configureOptions;

@end
