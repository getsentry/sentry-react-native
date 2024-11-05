#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>

#ifdef RCT_NEW_ARCH_ENABLED
#    import <React/RCTViewComponentView.h>
#else
#    import <React/RCTView.h>
#endif

@interface RNSentryReplayMaskManager : RCTViewManager
@end

@interface RNSentryReplayMask :
#ifdef RCT_NEW_ARCH_ENABLED
    RCTViewComponentView
#else
    RCTView
#endif
@end
