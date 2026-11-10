#import <Sentry/SentryDefines.h>

#if SENTRY_HAS_UIKIT

#    ifdef RCT_NEW_ARCH_ENABLED
#        import <React/RCTViewComponentView.h>

/**
 * Fabric version of the on-draw reporter, used only when React Native is built without the legacy
 * component interop layer. Other builds keep the legacy view manager.
 */
@interface RNSentryOnDrawReporterComponentView : RCTViewComponentView
@end

#    endif

#endif
