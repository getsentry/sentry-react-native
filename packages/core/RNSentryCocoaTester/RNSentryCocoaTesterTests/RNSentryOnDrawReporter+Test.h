#import "RNSentryOnDrawReporter.h"
#import <Foundation/Foundation.h>

@interface
RNSentryOnDrawReporterView (Testing)

+ (instancetype)createWithMockedListener;
- (RNSentryEmitNewFrameEvent)createEmitNewFrameEvent;

@end
