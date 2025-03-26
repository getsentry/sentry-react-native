#import <Sentry/SentryDefines.h>

#if SENTRY_HAS_UIKIT

#    import "RNSentryFramesTrackerListener.h"
#    import <React/RCTViewManager.h>
#    import <UIKit/UIKit.h>

@interface RNSentryOnDrawReporter : RCTViewManager

@end

@interface RNSentryOnDrawReporterView : UIView

@property (nonatomic, strong) id<RNSentryFramesTrackerListenerProtocol> framesListener;
@property (nonatomic) bool fullDisplay;
@property (nonatomic) bool initialDisplay;
@property (nonatomic) bool spanIdUsed;
@property (nonatomic, copy) NSString *parentSpanId;
@property (nonatomic, weak) RNSentryOnDrawReporter *delegate;
@property (nonatomic) bool previousFullDisplay;
@property (nonatomic) bool previousInitialDisplay;
@property (nonatomic, copy) NSString *previousParentSpanId;

@end

#endif
