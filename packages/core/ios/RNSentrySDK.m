#import "RNSentrySDK.h"
#import "RNSentryStart.h"

@implementation RNSentrySDK

+ (void)startWithConfigureOptions:(void (^)(SentryOptions *options))configureOptions
{
    SentryOptions *options = [[SentryOptions alloc] init];
    [RNSentryStart updateWithReactDefaults:options];
    configureOptions(options);
    [RNSentryStart updateWithReactFinals:options];
    [RNSentryStart startWithOptions:options];
}

@end
