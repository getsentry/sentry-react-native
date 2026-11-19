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

#import "SentryNativeInitializer.h"
#import <RNSentry/RNSentry.h>
#import <Sentry/Sentry.h>

@interface AppDelegate () <UNUserNotificationCenterDelegate> {
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

    // When the native init is enabled the `autoInitializeNativeSdk`
    // in JS has to be set to `false`
    // [SentryNativeInitializer initializeSentry];
    self.reactNativeFactory = [[RCTReactNativeFactory alloc] initWithDelegate:self];
    self.dependencyProvider = [RCTAppDependencyProvider new];

    // React Native starts in SceneDelegate once the window scene connects.

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
    return ![arguments containsObject:@"sentryDisableNativeStart"];
}

- (BOOL)shouldCrashOnStart
{
    NSArray<NSString *> *arguments = [[NSProcessInfo processInfo] arguments];
    return [arguments containsObject:@"sentryCrashOnStart"];
}

@end

@implementation SceneDelegate

- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions
{
    if (![scene isKindOfClass:[UIWindowScene class]]) {
        return;
    }

    AppDelegate *appDelegate = (AppDelegate *)[UIApplication sharedApplication].delegate;
    self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
    appDelegate.window = self.window;

    [appDelegate.reactNativeFactory startReactNativeWithModuleName:@"sentry-react-native-sample"
                                                          inWindow:self.window
                                                 initialProperties:@{ }
                                                 connectionOptions:connectionOptions];
}

@end
