#import "RNSentrySDK.h"

@interface
RNSentrySDK (Test)

+ (void)start:(NSString *)path
    configureOptions:(void (^)(SentryOptions *_Nonnull options))configureOptions;

@end
