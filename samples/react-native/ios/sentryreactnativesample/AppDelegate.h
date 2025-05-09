#import <RCTDefaultReactNativeFactoryDelegate.h>
#import <RCTReactNativeFactory.h>
#import <UIKit/UIKit.h>

@interface AppDelegate : RCTDefaultReactNativeFactoryDelegate <UIApplicationDelegate>

@property (nonatomic, strong, nonnull) UIWindow *window;
@property (nonatomic, strong, nonnull) RCTReactNativeFactory *reactNativeFactory;

@end
