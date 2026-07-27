#import "RNSentryReplayBreadcrumbConverterHelper.h"

#if SENTRY_TARGET_REPLAY_SUPPORTED
#    import "RNSentryReplayBreadcrumbConverter.h"

@implementation RNSentryReplayBreadcrumbConverterHelper

+ (void)configureSessionReplayWithConverter
{
    RNSentryReplayBreadcrumbConverter *breadcrumbConverter =
        [[RNSentryReplayBreadcrumbConverter alloc] init];
    [PrivateSentrySDKOnly configureSessionReplayWith:breadcrumbConverter screenshotProvider:nil];
}

@end

#endif
