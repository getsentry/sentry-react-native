#import "RNSentryReplayBreadcrumbConverterHelper.h"

#if SENTRY_TARGET_REPLAY_SUPPORTED
#    import "RNSentry-Swift.h"
#    import "RNSentryReplayBreadcrumbConverter.h"

@implementation RNSentryReplayBreadcrumbConverterHelper

+ (void)configureSessionReplayWithConverter
{
    RNSentryReplayBreadcrumbConverter *breadcrumbConverter =
        [[RNSentryReplayBreadcrumbConverter alloc] init];
    [RNSentryInternal configureReplayWithBreadcrumbConverter:breadcrumbConverter];
}

@end

#endif
