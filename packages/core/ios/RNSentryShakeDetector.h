#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

extern NSNotificationName const RNSentryShakeDetectedNotification;

/**
 * Detects shake gestures by swizzling UIWindow's motionEnded:withEvent: method.
 *
 * This approach uses UIKit's built-in shake detection via the responder chain,
 * which does NOT require NSMotionUsageDescription or any other permissions.
 * (NSMotionUsageDescription is only needed for Core Motion / CMMotionManager.)
 */
@interface RNSentryShakeDetector : NSObject

+ (void)enable;
+ (void)disable;
+ (BOOL)isEnabled;

@end

NS_ASSUME_NONNULL_END
