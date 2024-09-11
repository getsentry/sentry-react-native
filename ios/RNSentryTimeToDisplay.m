#import "RNSentryTimeToDisplay.h"
#import <QuartzCore/QuartzCore.h>
#import <React/RCTLog.h>

@implementation RNSentryTimeToDisplay
{
  CADisplayLink *displayLink;
  RCTPromiseResolveBlock resolveBlock;
}


RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(requestAnimationFrame:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  // Store the resolve block to use in the callback
  resolveBlock = resolve;

  // Create and add a display link to get the callback after the screen is rendered
  displayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(handleDisplayLink:)];
  [displayLink addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
}

- (void)handleDisplayLink:(CADisplayLink *)link
{
  // Get the current time
  NSTimeInterval currentTime = [[NSDate date] timeIntervalSince1970] * 1000;

  // Resolve the promise
  if (resolveBlock) {
    resolveBlock(@(currentTime));
    resolveBlock = nil;
  }

  // Invalidate the display link
  [displayLink invalidate];
  displayLink = nil;
}

@end
