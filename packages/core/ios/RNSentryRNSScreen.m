#import "RNSentryRNSScreen.h"

#if SENTRY_HAS_UIKIT

#    import <Sentry/SentryDependencyContainer.h>
#    import <Sentry/SentryFramesTracker.h>
#    import <Sentry/SentrySwizzle.h>

#    import "RNSentryDependencyContainer.h"

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
