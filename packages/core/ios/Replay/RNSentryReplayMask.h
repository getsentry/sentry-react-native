#import <Sentry/SentryDefines.h>

#if SENTRY_HAS_UIKIT

#    import <React/RCTViewManager.h>

#    ifdef RCT_NEW_ARCH_ENABLED
#        import <React/RCTViewComponentView.h>
#    else
#        import <React/RCTView.h>
#    endif

@interface RNSentryReplayMaskManager : RCTViewManager
@end

@interface RNSentryReplayMask :
#    ifdef RCT_NEW_ARCH_ENABLED
    RCTViewComponentView
#    else
    RCTView
#    endif
@end

#endif
