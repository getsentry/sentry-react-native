/**
 * Makes the Expo sample adopt the iOS UIScene lifecycle with Expo's own `EXExpoAppSceneDelegate`
 * (a Swift `UIWindowSceneDelegate`). This is the direction Apple/Expo are pushing every app
 * ("Required by iOS 27"), so running the sample this way keeps the SDK exercised under the
 * lifecycle real apps are migrating to.
 *
 * Expo 57 ships `ExpoAppSceneDelegate` but does not yet wire it up during prebuild, so this plugin
 * does it:
 *   1. Adds a `UIApplicationSceneManifest` to Info.plist pointing at `EXExpoAppSceneDelegate`.
 *   2. Makes the generated `AppDelegate` conform to `ExpoReactNativeFactoryProvider` and defer the
 *      window / React Native start to the scene delegate.
 */
const { withInfoPlist, withAppDelegate } = require('@expo/config-plugins');

const SCENE_DELEGATE_CLASS = 'EXExpoAppSceneDelegate';

function withSceneManifest(config) {
  return withInfoPlist(config, cfg => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: SCENE_DELEGATE_CLASS,
          },
        ],
      },
    };
    return cfg;
  });
}

function patchAppDelegate(contents) {
  let out = contents;

  // Conform to ExpoReactNativeFactoryProvider so the scene delegate can retrieve the factory the
  // app delegate creates in didFinishLaunching.
  const classDecl = 'class AppDelegate: ExpoAppDelegate {';
  if (!out.includes(classDecl)) {
    throw new Error('[withIosSceneLifecycle] AppDelegate class declaration not found; Expo template changed.');
  }
  out = out.replace(classDecl, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');

  // Remove the app-delegate window creation + RN start; under the scene lifecycle the scene
  // delegate (ExpoAppSceneDelegate) owns the window and starts React Native.
  const windowBlock = /#if os\(iOS\) \|\| os\(tvOS\)[\s\S]*?factory\.startReactNative\([\s\S]*?\)\s*#endif/;
  if (!windowBlock.test(out)) {
    throw new Error('[withIosSceneLifecycle] window/startReactNative block not found; Expo template changed.');
  }
  out = out.replace(
    windowBlock,
    [
      '// [withIosSceneLifecycle] Scene lifecycle: ExpoAppSceneDelegate creates the window and',
      '    // starts React Native in scene(_:willConnectTo:). Do NOT start it here.',
    ].join('\n'),
  );

  return out;
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, cfg => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('[withIosSceneLifecycle] expected a Swift AppDelegate.');
    }
    cfg.modResults.contents = patchAppDelegate(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = function withIosSceneLifecycle(config) {
  config = withSceneManifest(config);
  config = withSceneAppDelegate(config);
  return config;
};
