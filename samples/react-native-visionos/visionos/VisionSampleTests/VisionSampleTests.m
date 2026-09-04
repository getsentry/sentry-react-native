#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>

#import <React/RCTLog.h>
#import <React/RCTRootView.h>

#define TIMEOUT_SECONDS 600
#define TEXT_TO_LOOK_FOR @"Sentry React Native visionOS"

@interface VisionSampleTests : XCTestCase

@end

@implementation VisionSampleTests

- (BOOL)findSubviewInView:(UIView *)view matching:(BOOL (^)(UIView *view))test
{
    if (test(view)) {
        return YES;
    }
    for (UIView *subview in [view subviews]) {
        if ([self findSubviewInView:subview matching:test]) {
            return YES;
        }
    }
    return NO;
}

// The visionOS app uses the SwiftUI `@main` + `RCTMainWindow` lifecycle, so there is no
// `AppDelegate.window`. Reach the root view controller through the active window scene instead.
- (UIViewController *)rootViewController
{
    for (UIScene *scene in RCTSharedApplication().connectedScenes) {
        if (![scene isKindOfClass:[UIWindowScene class]]) {
            continue;
        }
        UIWindowScene *windowScene = (UIWindowScene *)scene;
        for (UIWindow *window in windowScene.windows) {
            if (window.isKeyWindow && window.rootViewController) {
                return window.rootViewController;
            }
        }
        for (UIWindow *window in windowScene.windows) {
            if (window.rootViewController) {
                return window.rootViewController;
            }
        }
    }
    return nil;
}

- (void)testRendersWelcomeScreen
{
    NSDate *date = [NSDate dateWithTimeIntervalSinceNow:TIMEOUT_SECONDS];
    BOOL foundElement = NO;

    __block NSString *redboxError = nil;
#ifdef DEBUG
    RCTSetLogFunction(^(RCTLogLevel level, RCTLogSource source, NSString *fileName,
        NSNumber *lineNumber, NSString *message) {
        if (level >= RCTLogLevelError) {
            redboxError = message;
        }
    });
#endif

    while ([date timeIntervalSinceNow] > 0 && !foundElement && !redboxError) {
        [[NSRunLoop mainRunLoop] runMode:NSDefaultRunLoopMode
                              beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
        [[NSRunLoop mainRunLoop] runMode:NSRunLoopCommonModes
                              beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];

        UIViewController *vc = [self rootViewController];
        foundElement =
            [self findSubviewInView:vc.view
                           matching:^BOOL(UIView *view) {
                               if ([view.accessibilityLabel isEqualToString:TEXT_TO_LOOK_FOR]) {
                                   return YES;
                               }
                               return NO;
                           }];
    }

#ifdef DEBUG
    RCTSetLogFunction(RCTDefaultLogFunction);
#endif

    XCTAssertNil(redboxError, @"RedBox error: %@", redboxError);
    XCTAssertTrue(foundElement, @"Couldn't find element with text '%@' in %d seconds",
        TEXT_TO_LOOK_FOR, TIMEOUT_SECONDS);
}

@end
