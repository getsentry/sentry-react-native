#import "RNSentryTimeToDisplayModule.h"
#import <QuartzCore/QuartzCore.h>
#import <React/RCTLog.h>

@implementation RNSentryTimeToDisplayModule
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
  NSTimeInterval currentTime = [[NSDate date] timeIntervalSince1970];

  if (resolveBlock) {
    resolveBlock(@(currentTime));
    resolveBlock = nil;
  }

  // Invalidate the display link
  [displayLink invalidate];
  displayLink = nil;
}

@end
