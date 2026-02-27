#import "RNSentryShakeDetector.h"

#if SENTRY_HAS_UIKIT

#    import <UIKit/UIKit.h>
#    import <objc/runtime.h>

NSNotificationName const RNSentryShakeDetectedNotification = @"RNSentryShakeDetected";

static BOOL _shakeDetectionEnabled = NO;
static IMP _originalSendEventIMP = NULL;
static BOOL _swizzled = NO;
static NSTimeInterval _lastShakeTimestamp = 0;
static const NSTimeInterval SHAKE_COOLDOWN_SECONDS = 1.0;

// Intercepts all UIApplication events before they enter the responder chain.
// This ensures shake events are detected even when React Native's dev menu
// or another responder consumes the motion event without calling super.
static void
sentry_sendEvent(UIApplication *self, SEL _cmd, UIEvent *event)
{
    if (_shakeDetectionEnabled && event.type == UIEventTypeMotion
        && event.subtype == UIEventSubtypeMotionShake) {
        NSTimeInterval now = [[NSDate date] timeIntervalSince1970];
        if (now - _lastShakeTimestamp > SHAKE_COOLDOWN_SECONDS) {
            _lastShakeTimestamp = now;
            [[NSNotificationCenter defaultCenter]
                postNotificationName:RNSentryShakeDetectedNotification
                              object:nil];
        }
    }

    if (_originalSendEventIMP) {
        ((void (*)(id, SEL, UIEvent *))_originalSendEventIMP)(self, _cmd, event);
    }
}

@implementation RNSentryShakeDetector

+ (void)enable
{
    @synchronized(self) {
        if (!_swizzled) {
            // Use the actual class of the shared application to handle UIApplication subclasses
            Class appClass = [[UIApplication sharedApplication] class];
            Method originalMethod = class_getInstanceMethod(appClass, @selector(sendEvent:));
            if (originalMethod) {
                _originalSendEventIMP = method_getImplementation(originalMethod);
                method_setImplementation(originalMethod, (IMP)sentry_sendEvent);
                _swizzled = YES;
            }
        }
        _shakeDetectionEnabled = YES;
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
