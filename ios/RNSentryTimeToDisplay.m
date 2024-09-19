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

#if TARGET_OS_IOS
  // Create and add a display link to get the callback after the screen is rendered
  displayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(handleDisplayLink:)];
  [displayLink addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
#else
#endif
}

#if TARGET_OS_IOS
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
#endif

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(isAvailable)
{
#if TARGET_OS_IOS
  return @(YES);
#else
  return @(NO); // MacOS
#endif
}

@end
