#import "RNSentryRNSScreen.h"

#if SENTRY_HAS_UIKIT

#    import "RNSentryDependencyContainer.h"
#    import "RNSentryFramesTrackerListener.h"
#    import "SentrySwizzle.h"
@import Sentry;

@implementation RNSentryRNSScreen

+ (void)swizzleViewDidAppear
{
    Class rnsscreenclass = NSClassFromString(@"RNSScreen");
    if (rnsscreenclass == nil) {
        return;
    }

    SEL selector = NSSelectorFromString(@"viewDidAppear:");
    SentrySwizzleInstanceMethod(rnsscreenclass, selector, SentrySWReturnType(void),
        SentrySWArguments(BOOL animated), SentrySWReplacement({
            [[[RNSentryDependencyContainer sharedInstance] framesTrackerListener] startListening];
            SentrySWCallOriginal(animated);
        }),
        SentrySwizzleModeOncePerClass, (void *)selector);
}

@end

#endif
