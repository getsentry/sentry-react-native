#import "RNSentryRNSScreen.h"

#if SENTRY_HAS_UIKIT

#    import "RNSentryDependencyContainer.h"
#    import "RNSentryFramesTrackerListener.h"
// `SentrySwizzle.h` is a private header of `Sentry.framework`. We deliberately
// keep using the ObjC swizzle API here instead of routing through
// `SentrySDK.internal.swizzle` (the Swift `@_spi(Private)` equivalent):
// the Swift SPI enum case `SentryInternalSwizzleApi.Mode.oncePerClass` is not
// exported as a linkable symbol from sentry-cocoa's prebuilt static
// xcframework, so consumers on the default (`SENTRY_USE_XCFRAMEWORK` unset)
// path fail to link with `Undefined symbols: enum case for
// SentryInternalSwizzleApi.Mode.oncePerClass`. The ObjC `SentrySwizzle`
// class + `SentrySwizzleMode` enum have proper external symbols in the
// xcframework slice, so this path links cleanly for both the xcframework
// and source-built (`SENTRY_USE_XCFRAMEWORK=0`) configurations. See #6465.
#    if __has_include(<Sentry/SentrySwizzle.h>)
#        import <Sentry/SentrySwizzle.h>
#    else
#        import "SentrySwizzle.h"
#    endif

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
