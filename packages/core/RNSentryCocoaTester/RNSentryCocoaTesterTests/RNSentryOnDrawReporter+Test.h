#import "RNSentryOnDrawReporter.h"
#import "RNSentryEmitNewFrameEvent.h"
#import <Foundation/Foundation.h>

@interface RNSentryOnDrawReporterView (Testing)

+ (instancetype)createWithMockedListener;
- (RNSentryEmitNewFrameEvent)createEmitNewFrameEvent;

@end
