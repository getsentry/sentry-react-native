#import "RNSentryTimeToDisplay.h"
#import <QuartzCore/QuartzCore.h>
#import <React/RCTLog.h>

@implementation RNSentryTimeToDisplay {
    CADisplayLink *displayLink;
    RCTResponseSenderBlock resolveBlock;
}

// Rename requestAnimationFrame to getTimeToDisplay
- (void)getTimeToDisplay:(RCTResponseSenderBlock)callback
{
    // Store the resolve block to use in the callback.
    resolveBlock = callback;

#if TARGET_OS_IOS
    // Create and add a display link to get the callback after the screen is rendered.
    displayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(handleDisplayLink:)];
    [displayLink addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
#else
    resolveBlock(@[]); // Return nothing if not iOS.
#endif
}

#if TARGET_OS_IOS
- (void)handleDisplayLink:(CADisplayLink *)link
{
    // Get the current time
    NSTimeInterval currentTime =
        [[NSDate date] timeIntervalSince1970] * 1000.0; // Convert to milliseconds

    // Ensure the callback is valid and pass the current time back
    if (resolveBlock) {
        resolveBlock(@[ @(currentTime) ]); // Call the callback with the current time
        resolveBlock = nil; // Clear the block after it's called
    }

    // Invalidate the display link to stop future callbacks
    [displayLink invalidate];
    displayLink = nil;
}
#endif

@end
