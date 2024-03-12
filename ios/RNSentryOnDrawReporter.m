#import <UIKit/UIKit.h>
#import <React/RCTViewManager.h>
#import "RNSentryFramesTrackerListener.h"
#import <Sentry/SentryDependencyContainer.h>

@interface RNSentryOnDrawReporter : RCTViewManager

@end

@interface RNSentryOnDrawReporterView : UIView

@property (nonatomic, strong) RNSentryFramesTrackerListener* framesListener;
@property (nonatomic, copy) RCTBubblingEventBlock onDrawNextFrame;
@property (nonatomic) bool fullDisplay;
@property (nonatomic) bool initialDisplay;
@property (nonatomic, weak) RNSentryOnDrawReporter* delegate;

@end

@implementation RNSentryOnDrawReporter

RCT_EXPORT_MODULE(RNSentryOnDrawReporter)
RCT_EXPORT_VIEW_PROPERTY(onDrawNextFrame, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(initialDisplay, BOOL)
RCT_EXPORT_VIEW_PROPERTY(fullDisplay, BOOL)

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
          if (self->_fullDisplay) {
            self.onDrawNextFrame(@{
              @"newFrameTimestampInSeconds": newFrameTimestampInSeconds,
              @"type": @"fullDisplay"
            });
            return;
          }

          if (self->_initialDisplay) {
            self.onDrawNextFrame(@{
              @"newFrameTimestampInSeconds": newFrameTimestampInSeconds,
              @"type": @"initialDisplay"
            });
            return;
          }
        };
        _framesListener = [[RNSentryFramesTrackerListener alloc] initWithSentryFramesTracker:[[SentryDependencyContainer sharedInstance] framesTracker]
                                                                             andEventEmitter:emitNewFrameEvent];
    }
    return self;
}

- (void)didSetProps:(NSArray<NSString *> *)changedProps
{
  if (_fullDisplay || _initialDisplay) {
    [_framesListener startListening];
  }
}

@end
