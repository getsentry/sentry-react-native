#import <Sentry/SentryDefines.h>

#if SENTRY_HAS_UIKIT

#    import "RNSentryEmitNewFrameEvent.h"
#    import <Foundation/Foundation.h>
#    import <React/RCTEventEmitter.h>

@import Sentry;

@protocol RNSentryFramesTrackerListenerProtocol <SentryFramesTrackerListener>

- (void)startListening;

@end

@interface RNSentryFramesTrackerListener : NSObject <RNSentryFramesTrackerListenerProtocol>

- (instancetype)initWithSentryFramesTracker:(SentryFramesTracker *)framesTracker
                            andEventEmitter:(RNSentryEmitNewFrameEvent)emitNewFrameEvent;

@property (strong, nonatomic) SentryFramesTracker *framesTracker;
@property (strong, nonatomic) RNSentryEmitNewFrameEvent emitNewFrameEvent;

@end

#endif
