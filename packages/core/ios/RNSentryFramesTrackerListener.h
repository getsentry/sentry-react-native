#import <Sentry/SentryDefines.h>

#if SENTRY_HAS_UIKIT

#    import <Foundation/Foundation.h>
#    import <React/RCTEventEmitter.h>
#    import <Sentry/SentryFramesTracker.h>

typedef void (^RNSentryEmitNewFrameEvent)(NSNumber *newFrameTimestampInSeconds);

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
