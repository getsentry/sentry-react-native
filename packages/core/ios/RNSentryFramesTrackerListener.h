#import <Sentry/SentryDefines.h>

#if SENTRY_HAS_UIKIT

#    import <Foundation/Foundation.h>
#    import <React/RCTEventEmitter.h>
#    import <Sentry/SentryFramesTracker.h>

typedef void (^RNSentryEmitNewFrameEvent)(NSNumber *newFrameTimestampInSeconds);

@interface RNSentryFramesTrackerListener : NSObject <SentryFramesTrackerListener>

- (instancetype)initWithSentryFramesTracker:(SentryFramesTracker *)framesTracker
                            andEventEmitter:(RNSentryEmitNewFrameEvent)emitNewFrameEvent;

- (void)startListening;

@property (strong, nonatomic) SentryFramesTracker *framesTracker;
@property (strong, nonatomic) RNSentryEmitNewFrameEvent emitNewFrameEvent;

@end

#endif
