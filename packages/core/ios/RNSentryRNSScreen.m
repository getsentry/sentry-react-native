#import "RNSentryRNSScreen.h"

#if SENTRY_HAS_UIKIT

#    import "RNSentryDependencyContainer.h"
#    import "RNSentryFramesTrackerListener.h"
#    import "RNSentrySwiftBridge.h"

@implementation RNSentryRNSScreen

+ (void)swizzleViewDidAppear
{
    [RNSentryInternal swizzleRNSScreenViewDidAppearWithHook:^{
        [[[RNSentryDependencyContainer sharedInstance] framesTrackerListener] startListening];
    }];
}

@end

#endif
