#import "RNSentryShakeDetector.h"

#if SENTRY_HAS_UIKIT

#    import <UIKit/UIKit.h>
#    import <objc/runtime.h>

NSNotificationName const RNSentryShakeDetectedNotification = @"RNSentryShakeDetected";

static BOOL _shakeDetectionEnabled = NO;
static IMP _originalMotionEndedIMP = NULL;
static BOOL _swizzled = NO;

static void
sentry_motionEnded(id self, SEL _cmd, UIEventSubtype motion, UIEvent *event)
{
    if (_shakeDetectionEnabled && motion == UIEventSubtypeMotionShake) {
        [[NSNotificationCenter defaultCenter] postNotificationName:RNSentryShakeDetectedNotification
                                                            object:nil];
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
            Method originalMethod
                = class_getInstanceMethod([UIWindow class], @selector(motionEnded:withEvent:));
            if (originalMethod) {
                _originalMotionEndedIMP = method_getImplementation(originalMethod);
                method_setImplementation(originalMethod, (IMP)sentry_motionEnded);
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
