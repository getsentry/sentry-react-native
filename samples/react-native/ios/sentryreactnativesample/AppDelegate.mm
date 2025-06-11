#import "AppDelegate.h"

#import <UserNotifications/UserNotifications.h>

#import <React/RCTBundleURLProvider.h>
#import <React/RCTDefines.h>
#import <React/RCTLinkingManager.h>
#import <ReactCommon/RCTTurboModuleManager.h>

#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

#ifdef RCT_NEW_ARCH_ENABLED
#    import <NativeSampleModule.h>
#endif

#import <RNSentry/RNSentry.h>
#import <Sentry/PrivateSentrySDKOnly.h>
#import <Sentry/Sentry.h>

@interface
AppDelegate () <UNUserNotificationCenterDelegate> {
}
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
    if ([self shouldStartSentry]) {
        [RNSentrySDK start];
    }

    if ([self shouldCrashOnStart]) {
        @throw [NSException exceptionWithName:@"CrashOnStart"
                                       reason:@"This was intentional test crash before JS started."
                                     userInfo:nil];
    }

    self.reactNativeFactory = [[RCTReactNativeFactory alloc] initWithDelegate:self];
    self.dependencyProvider = [RCTAppDependencyProvider new];

    self.window = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];

    [self.reactNativeFactory startReactNativeWithModuleName:@"sentry-react-native-sample"
                                                   inWindow:self.window
                                          initialProperties:@{}
                                              launchOptions:launchOptions];

    [[UNUserNotificationCenter currentNotificationCenter] setDelegate:self];

    return YES;
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

#pragma mark - RCTComponentViewFactoryComponentProvider

- (std::shared_ptr<facebook::react::TurboModule>)
    getTurboModule:(const std::string &)name
         jsInvoker:(std::shared_ptr<facebook::react::CallInvoker>)jsInvoker
{
#ifdef RCT_NEW_ARCH_ENABLED
    if (name == std::string([@"NativeSampleModule" UTF8String])) {
        return std::make_shared<facebook::react::NativeSampleModule>(jsInvoker);
    }
#endif

    return [super getTurboModule:name jsInvoker:jsInvoker];
}

- (BOOL)shouldStartSentry
{
    NSArray<NSString *> *arguments = [[NSProcessInfo processInfo] arguments];
    return ![arguments containsObject:@"--sentry-disable-native-start"];
}

- (BOOL)shouldCrashOnStart
{
    NSArray<NSString *> *arguments = [[NSProcessInfo processInfo] arguments];
    return [arguments containsObject:@"--sentry-crash-on-start"];
}

@end
