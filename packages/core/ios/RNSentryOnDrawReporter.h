#import <Sentry/SentryDefines.h>

#if SENTRY_HAS_UIKIT

#    import "RNSentryFramesTrackerListener.h"
#    import <React/RCTViewManager.h>
#    import <UIKit/UIKit.h>

@interface RNSentryOnDrawReporter : RCTViewManager

@end

@interface RNSentryOnDrawReporterView : UIView

@property (nonatomic, strong) RNSentryFramesTrackerListener *framesListener;
@property (nonatomic, copy) RCTBubblingEventBlock onDrawNextFrame;
@property (nonatomic) bool fullDisplay;
@property (nonatomic) bool initialDisplay;
@property (nonatomic, weak) RNSentryOnDrawReporter *delegate;

@end

#endif
