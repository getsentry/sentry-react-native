#import <RCTDefaultReactNativeFactoryDelegate.h>
#import <RCTReactNativeFactory.h>
#import <UIKit/UIKit.h>

@interface AppDelegate : RCTDefaultReactNativeFactoryDelegate <UIApplicationDelegate>

// Set by SceneDelegate. UIKit takes the window from the scene, but tests read it from here.
@property (nonatomic, strong, nullable) UIWindow *window;
@property (nonatomic, strong, nonnull) RCTReactNativeFactory *reactNativeFactory;

@end

// Apps built with the iOS 27 SDK must use the UIScene life cycle or they don't launch (TN3187).
@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>

@property (nonatomic, strong, nullable) UIWindow *window;

@end
