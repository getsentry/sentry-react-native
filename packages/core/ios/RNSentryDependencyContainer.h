#import <Sentry/SentryDefines.h>

#import "RNSentryFramesTrackerListener.h"

@interface RNSentryDependencyContainer : NSObject
SENTRY_NO_INIT

@property (class, readonly, strong) RNSentryDependencyContainer *sharedInstance;

#if SENTRY_HAS_UIKIT

@property (nonatomic, strong) RNSentryFramesTrackerListener *framesTrackerListener;

- (void)initializeFramesTrackerListenerWith:(RNSentryEmitNewFrameEvent)eventEmitter;

#endif

@end
