#import "RNSentryReplayBreadcrumbConverterHelper.h"

#if SENTRY_TARGET_REPLAY_SUPPORTED
#    import "RNSentryReplayBreadcrumbConverter.h"
#    import "RNSentrySwiftBridge.h"

@implementation RNSentryReplayBreadcrumbConverterHelper

+ (void)configureSessionReplayWithConverter
{
    RNSentryReplayBreadcrumbConverter *breadcrumbConverter =
        [[RNSentryReplayBreadcrumbConverter alloc] init];
    [RNSentryInternal configureReplayWithBreadcrumbConverter:breadcrumbConverter];
}

@end

#endif
