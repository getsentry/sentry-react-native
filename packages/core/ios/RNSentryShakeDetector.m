#import "RNSentryShakeDetector.h"

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

#if TARGET_OS_IOS

NSNotificationName const RNSentryShakeDetectedNotification = @"RNSentryShakeDetected";

static BOOL _shakeDetectionEnabled = NO;
static BOOL _swizzled = NO;
static IMP _originalMotionEndedIMP = NULL;
static NSTimeInterval _lastShakeTimestamp = 0;
static const NSTimeInterval SHAKE_COOLDOWN_SECONDS = 1.0;

// C function that replaces UIWindow's motionEnded:withEvent: IMP.
// Uses method_setImplementation to install itself and saves the original IMP
// to call afterwards, preserving the responder chain and composing with other
// swizzles (e.g. RCTDevMenu in debug builds).
static void
sentry_motionEnded(UIWindow *self, SEL _cmd, UIEventSubtype motion, UIEvent *event)
{
    if (_shakeDetectionEnabled && motion == UIEventSubtypeMotionShake) {
        NSTimeInterval now = [[NSDate date] timeIntervalSince1970];
        if (now - _lastShakeTimestamp > SHAKE_COOLDOWN_SECONDS) {
            _lastShakeTimestamp = now;
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
        if (!_swizzled) {
            Class windowClass = [UIWindow class];
            SEL sel = @selector(motionEnded:withEvent:);

            // UIWindow may not have its own motionEnded:withEvent: — it can inherit from
            // UIResponder. We must ensure the method exists directly on UIWindow before
            // replacing its IMP, otherwise the inherited method on UIResponder would be
            // modified, affecting all UIResponder subclasses.
            Method inheritedMethod = class_getInstanceMethod(windowClass, sel);
            if (!inheritedMethod) {
                return;
            }

            // class_addMethod only succeeds if UIWindow does NOT already have its own
            // implementation of motionEnded:withEvent:. In that case, we add a direct
            // implementation to UIWindow that just calls super (the inherited IMP).
            IMP inheritedIMP = method_getImplementation(inheritedMethod);
            const char *types = method_getTypeEncoding(inheritedMethod);
            class_addMethod(windowClass, sel, inheritedIMP, types);

            // Now UIWindow definitely has its own motionEnded:withEvent:. Get its Method
            // (which may be the one we just added, or a pre-existing one from e.g. RCTDevMenu)
            // and replace the IMP with our interceptor.
            Method ownMethod = class_getInstanceMethod(windowClass, sel);
            _originalMotionEndedIMP = method_setImplementation(ownMethod, (IMP)sentry_motionEnded);
            _swizzled = YES;
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
