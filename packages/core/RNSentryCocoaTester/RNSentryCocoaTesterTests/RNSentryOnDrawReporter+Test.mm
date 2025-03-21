#import "RNSentryOnDrawReporter+Test.h"

@interface MockedListener : NSObject <RNSentryFramesTrackerListenerProtocol>
@property (strong, nonatomic) RNSentryEmitNewFrameEvent emitNewFrameEvent;
- (instancetype)initWithMockedListener:(RNSentryEmitNewFrameEvent)emitNewFrameEvent;
@end

@implementation MockedListener

- (instancetype)initWithMockedListener:(RNSentryEmitNewFrameEvent)emitNewFrameEvent
{
    self = [super init];
    if (self) {
        _emitNewFrameEvent = [emitNewFrameEvent copy];
    }
    return self;
}

- (void)startListening
{
    self.emitNewFrameEvent(@([[NSDate date] timeIntervalSince1970]));
}

- (void)framesTrackerHasNewFrame:(nonnull NSDate *)newFrameDate
{
    NSLog(@"Not implemented in the test mock");
}

@end

@implementation
RNSentryOnDrawReporterView (Testing)

+ (instancetype)createWithMockedListener
{
    return [[self alloc] initWithMockedListener];
}

- (instancetype)initWithMockedListener
{
    self = [super init];
    if (self) {
        self.framesListener =
            [[MockedListener alloc] initWithMockedListener:[self createEmitNewFrameEvent]];
    }
    return self;
}

@end
