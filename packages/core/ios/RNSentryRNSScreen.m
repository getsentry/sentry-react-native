#import "RNSentryRNSScreen.h"

#if SENTRY_HAS_UIKIT

#    if __has_include(<RNSentry/RNSentry-Swift.h>)
#        import <RNSentry/RNSentry-Swift.h>
#    else
#        import "RNSentry-Swift.h"
#    endif
#    import "RNSentryDependencyContainer.h"
#    import "RNSentryFramesTrackerListener.h"

@implementation RNSentryRNSScreen

+ (void)swizzleViewDidAppear
{
    [RNSentryInternal swizzleRNSScreenViewDidAppearWithHook:^{
        [[[RNSentryDependencyContainer sharedInstance] framesTrackerListener] startListening];
    }];
}

@end

#endif
