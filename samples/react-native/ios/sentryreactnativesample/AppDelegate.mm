#import "AppDelegate.h"

#import <RCTAppDelegate+Protected.h>
#import <React/CoreModulesPlugins.h>
#import <React/RCTBundleURLProvider.h>
#import <ReactCommon/RCTTurboModuleManager.h>

#ifdef RCT_NEW_ARCH_ENABLED
#    import <NativeSampleModule.h>
#endif

#import <RNSentry/RNSentry.h>
#import <Sentry/PrivateSentrySDKOnly.h>
#import <Sentry/Sentry.h>

@interface
AppDelegate () <RCTTurboModuleManagerDelegate> {
}
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
    if ([self shouldStartSentry]) {
        [RNSentrySDK start];
    }

    self.moduleName = @"sentry-react-native-sample";
    // You can add your custom initial props in the dictionary below.
    // They will be passed down to the ViewController used by React
    self.initialProps = @{};

    return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
    return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
    return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
    return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

/// This method controls whether the `concurrentRoot`feature of React18 is turned on or off.
///
/// @see: https://reactjs.org/blog/2022/03/29/react-v18.html
/// @note: This requires to be rendering on Fabric (i.e. on the New Architecture).
/// @return: `true` if the `concurrentRoot` feature is enabled. Otherwise, it returns `false`.
- (BOOL)concurrentRootEnabled
{
    return true;
}

#pragma mark RCTTurboModuleManagerDelegate

- (std::shared_ptr<facebook::react::TurboModule>)
    getTurboModule:(const std::string &)name
         jsInvoker:(std::shared_ptr<facebook::react::CallInvoker>)jsInvoker
{
#ifdef RCT_NEW_ARCH_ENABLED
    if (name == "NativeSampleModule") {
        return std::make_shared<facebook::react::NativeSampleModule>(jsInvoker);
    }
#endif
    return nullptr;
}

- (BOOL)shouldStartSentry
{
    NSArray<NSString *> *arguments = [[NSProcessInfo processInfo] arguments];
    return ![arguments containsObject:@"--sentry-disable-native-start"];
}

@end
