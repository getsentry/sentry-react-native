#import "RNSentryShakeDetector.h"

@import Sentry;

#if SENTRY_HAS_UIKIT

#    import <UIKit/UIKit.h>
#    import <objc/runtime.h>

NSNotificationName const RNSentryShakeDetectedNotification = @"RNSentryShakeDetected";

static BOOL _shakeDetectionEnabled = NO;
static IMP _originalMotionEndedIMP = NULL;
static BOOL _swizzled = NO;
static NSTimeInterval _lastShakeTimestamp = 0;
static const NSTimeInterval SHAKE_COOLDOWN_SECONDS = 1.0;

// Intercepts UIWindow motion events before they continue up the responder chain.
//
// The iOS simulator routes shake (Cmd+Ctrl+Z) through UIWindow.motionEnded:withEvent:,
// not through UIApplication.sendEvent:. React Native's dev menu also hooks UIWindow
// via RCTSwapInstanceMethods. Because we swizzle from startObserving (which fires after
// RN finishes loading), our IMP becomes the outermost layer: our code runs first,
// then the saved original IMP (RN's dev menu handler) is called.
static void
sentry_motionEnded(UIWindow *self, SEL _cmd, UIEventSubtype motion, UIEvent *event)
{
    NSLog(@"[Sentry] sentry_motionEnded called: enabled=%d motion=%ld shake=%ld",
        _shakeDetectionEnabled, (long)motion, (long)UIEventSubtypeMotionShake);
    if (_shakeDetectionEnabled && motion == UIEventSubtypeMotionShake) {
        NSTimeInterval now = [[NSDate date] timeIntervalSince1970];
        if (now - _lastShakeTimestamp > SHAKE_COOLDOWN_SECONDS) {
            _lastShakeTimestamp = now;
            NSLog(@"[Sentry] posting RNSentryShakeDetectedNotification");
            [[NSNotificationCenter defaultCenter]
                postNotificationName:RNSentryShakeDetectedNotification
                              object:nil];
        }
    }

    if (_originalMotionEndedIMP) {
        ((void (*)(id, SEL, UIEventSubtype, UIEvent *))_originalMotionEndedIMP)(
            self, _cmd, motion, event);
    }
}

@implementation RNSentryShakeDetector

+ (void)enable
{
    @synchronized(self) {
        NSLog(@"[Sentry] RNSentryShakeDetector enable called, swizzled=%d", _swizzled);
        if (!_swizzled) {
            Class windowClass = [UIWindow class];
            Method originalMethod
                = class_getInstanceMethod(windowClass, @selector(motionEnded:withEvent:));
            NSLog(
                @"[Sentry] motionEnded:withEvent: method found: %s", originalMethod ? "YES" : "NO");
            if (originalMethod) {
                _originalMotionEndedIMP = method_getImplementation(originalMethod);
                method_setImplementation(originalMethod, (IMP)sentry_motionEnded);
                _swizzled = YES;
                NSLog(@"[Sentry] UIWindow.motionEnded:withEvent: swizzled successfully");
            }
        }
        _shakeDetectionEnabled = YES;
        NSLog(@"[Sentry] shake detection enabled");
    }
}

+ (void)disable
{
    @synchronized(self) {
        _shakeDetectionEnabled = NO;
    }
}

+ (BOOL)isEnabled
{
    return _shakeDetectionEnabled;
}

@end

#else

NSNotificationName const RNSentryShakeDetectedNotification = @"RNSentryShakeDetected";

@implementation RNSentryShakeDetector

+ (void)enable
{
    // No-op on non-UIKit platforms (macOS, tvOS)
}

+ (void)disable
{
    // No-op
}

+ (BOOL)isEnabled
{
    return NO;
}

@end

#endif
