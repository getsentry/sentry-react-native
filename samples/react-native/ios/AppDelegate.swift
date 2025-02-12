import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import Sentry
import UIKit

@main
class AppDelegate: RCTAppDelegate {
  func initializeSentry() {
      SentrySDK.start { options in
          options.dsn = "https://1df17bd4e543fdb31351dee1768bb679@o447951.ingest.sentry.io/5428561"
          options.debug = true // Enabled debug when first installing is always helpful

          options.beforeSend = { event in
              if let exceptionType = event.exceptions?.first?.type,
                 exceptionType.contains("Unhandled JS Exception") {
                  print("Unhandled JS Exception")
                  return nil
              }
              return event
          }

          // Enable the App start and Frames tracking measurements
          // If this is disabled the app start and frames tracking
          // won't be passed from native to JS transactions
          PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode = true
          #if targetEnvironment(macCatalyst) || os(iOS)
          PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode = true
          #endif
      }
  }
  
  override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    // When the native init is enabled the `autoInitializeNativeSdk`
    // in JS has to be set to `false`
    // initializeSentry()
    
    self.moduleName = "sentry-react-native-sample"
    self.dependencyProvider = RCTAppDependencyProvider()

    // You can add your custom initial props in the dictionary below.
    // They will be passed down to the ViewController used by React Native.
    self.initialProps = [:]

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
  
  /// This method controls whether the `concurrentRoot` feature of React18 is turned on or off.
  /// @see: https://reactjs.org/blog/2022/03/29/react-v18.html
  /// @note: This requires rendering on Fabric (i.e. on the New Architecture).
  func concurrentRootEnabled() -> Bool {
      return true
  }
  
//  func getTurboModule(_ name: String?, jsInvoker: Any?) -> Any? {
//      guard let name = name else { return nil }
//
//      let cppJsInvoker = jsInvoker as? UnsafeMutableRawPointer
//      return TurboModuleProvider.getTurboModule(name, jsInvoker: cppJsInvoker)
//  }
}
