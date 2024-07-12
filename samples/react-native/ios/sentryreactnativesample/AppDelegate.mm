#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/CoreModulesPlugins.h>
#import <ReactCommon/RCTTurboModuleManager.h>

#ifdef RCT_NEW_ARCH_ENABLED
#import <NativeSampleModule.h>
#endif

#import <Sentry/Sentry.h>
#import <Sentry/PrivateSentrySDKOnly.h>

@interface AppDelegate () <RCTTurboModuleManagerDelegate> {}
@end

@implementation AppDelegate

- (void) initializeSentry
{
  [SentrySDK startWithConfigureOptions:^(SentryOptions *options) {
    // Only options set here will apply to the iOS SDK
    // Options from JS are not passed to the iOS SDK when initialized manually
    options.dsn = @"https://1df17bd4e543fdb31351dee1768bb679@o447951.ingest.sentry.io/5428561";
    options.debug = YES; // Enabled debug when first installing is always helpful

    options.beforeSend = ^SentryEvent*(SentryEvent *event) {
      // We don't want to send an event after startup that came from a Unhandled JS Exception of react native
      // Because we sent it already before the app crashed.
      if (nil != event.exceptions.firstObject.type &&
          [event.exceptions.firstObject.type rangeOfString:@"Unhandled JS Exception"].location != NSNotFound) {
        NSLog(@"Unhandled JS Exception");
        return nil;
      }

      return event;
    };

    // Enable the App start and Frames tracking measurements
    // If this is disabled the app start and frames tracking
    // won't be passed from native to JS transactions
    PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode = true;
#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
    PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode = true;
#endif
  }];
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // When the native init is enabled the `autoInitializeNativeSdk`
  // in JS has to be set to `false`
  // [self initializeSentry];

  self.moduleName = @"sentry-react-native-sample";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self getBundleURL];
}

- (NSURL *)getBundleURL
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

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const std::string &)name
                                                      jsInvoker:(std::shared_ptr<facebook::react::CallInvoker>)jsInvoker
{
#ifdef RCT_NEW_ARCH_ENABLED
  if (name == "NativeSampleModule") {
    return std::make_shared<facebook::react::NativeSampleModule>(jsInvoker);
  }
#endif
  return nullptr;
}

@end
