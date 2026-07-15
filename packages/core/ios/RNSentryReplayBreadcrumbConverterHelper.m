#import "RNSentryReplayBreadcrumbConverterHelper.h"

#if SENTRY_TARGET_REPLAY_SUPPORTED
#    if __has_include(<RNSentry/RNSentry-Swift.h>)
#        import <RNSentry/RNSentry-Swift.h>
#    else
#        import "RNSentry-Swift.h"
#    endif
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
