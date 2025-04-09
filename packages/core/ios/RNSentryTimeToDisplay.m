#import "RNSentryTimeToDisplay.h"
#import <QuartzCore/QuartzCore.h>
#import <React/RCTLog.h>

@implementation RNSentryTimeToDisplay {
    CADisplayLink *displayLink;
    RCTResponseSenderBlock resolveBlock;
}

static NSMutableDictionary<NSString *, NSNumber *> *screenIdToRenderDuration;
static NSMutableArray<NSString *> *screenIdAge;
static NSUInteger screenIdCurrentIndex;

static NSString *activeSpanId;

+ (void)initialize
{
    if (self == [RNSentryTimeToDisplay class]) {
        screenIdToRenderDuration =
            [[NSMutableDictionary alloc] initWithCapacity:TIME_TO_DISPLAY_ENTRIES_MAX_SIZE];
        screenIdAge = [[NSMutableArray alloc] initWithCapacity:TIME_TO_DISPLAY_ENTRIES_MAX_SIZE];
        screenIdCurrentIndex = 0;

        activeSpanId = nil;
    }
}

+ (void)setActiveSpanId:(NSString *)spanId
{
    activeSpanId = spanId;
}

+ (NSNumber *)popTimeToDisplayFor:(NSString *)screenId
{
    NSNumber *value = screenIdToRenderDuration[screenId];
    [screenIdToRenderDuration removeObjectForKey:screenId];
    return value;
}

+ (void)putTimeToInitialDisplayForActiveSpan:(NSNumber *)value
{
    if (activeSpanId != nil) {
        NSString *prefixedSpanId = [@"ttid-navigation-" stringByAppendingString:activeSpanId];
        [self putTimeToDisplayFor:prefixedSpanId value:value];
    }
}

+ (void)putTimeToDisplayFor:(NSString *)screenId value:(NSNumber *)value
{
    if (!screenId)
        return;

    // If key already exists, just update the value,
    // this should never happen as TTD is recorded once per navigation
    // We avoid updating the age to avoid the age array shift
    if ([screenIdToRenderDuration objectForKey:screenId]) {
        [screenIdToRenderDuration setObject:value forKey:screenId];
        return;
    }

    // If we haven't reached capacity yet, just append
    if (screenIdAge.count < TIME_TO_DISPLAY_ENTRIES_MAX_SIZE) {
        [screenIdToRenderDuration setObject:value forKey:screenId];
        [screenIdAge addObject:screenId];
    } else {
        // Remove oldest entry, in most case will already be removed by pop
        NSString *oldestKey = screenIdAge[screenIdCurrentIndex];
        [screenIdToRenderDuration removeObjectForKey:oldestKey];

        [screenIdToRenderDuration setObject:value forKey:screenId];
        screenIdAge[screenIdCurrentIndex] = screenId;

        // Update circular index, point to the new oldest
        screenIdCurrentIndex = (screenIdCurrentIndex + 1) % TIME_TO_DISPLAY_ENTRIES_MAX_SIZE;
    }
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
    NSTimeInterval currentTime = [[NSDate date] timeIntervalSince1970];

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
