#import <UIKit/UIKit.h>
#import <React/RCTViewManager.h>
#import "RNSentryFramesTrackerListener.h"
#import <Sentry/SentryDependencyContainer.h>

@interface RNSentryOnDrawReporter : RCTViewManager

@end

@interface RNSentryOnDrawReporterView : UIView

@property (nonatomic, strong) RNSentryFramesTrackerListener* framesListener;
@property (nonatomic, copy) RCTBubblingEventBlock onDrawNextFrame;
@property (nonatomic, weak) RNSentryOnDrawReporter* delegate;

@end

@implementation RNSentryOnDrawReporter

RCT_EXPORT_MODULE(RNSentryOnDrawReporter)
RCT_EXPORT_VIEW_PROPERTY(onDrawNextFrame, RCTBubblingEventBlock)

- (UIView *)view
{
  RNSentryOnDrawReporterView* view = [[RNSentryOnDrawReporterView alloc] init];
  return view;
}

@end

@implementation RNSentryOnDrawReporterView

- (instancetype)init {
    self = [super init];
    if (self) {
        RNSentryEmitNewFrameEvent emitNewFrameEvent = ^(NSNumber *newFrameTimestampInSeconds) {
            self.onDrawNextFrame(@{ @"newFrameTimestampInSeconds": newFrameTimestampInSeconds });
        };
        _framesListener = [[RNSentryFramesTrackerListener alloc] initWithSentryFramesTracker:[[SentryDependencyContainer sharedInstance] framesTracker]
                                                                             andEventEmitter:emitNewFrameEvent];
    }
    return self;
}

- (void)drawRect:(CGRect)rect {
    [super drawRect:rect];
    [_framesListener startListening];
}

@end
