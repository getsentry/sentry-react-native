#import "RNSentryRNSScreen.h"

#if SENTRY_HAS_UIKIT

#    import "RNSentry-Swift.h"
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
