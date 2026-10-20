/**
 * Keeps the Expo sample on the iOS UIScene lifecycle with a Swift `UIWindowSceneDelegate` (the
 * template's `SceneDelegate: ExpoAppSceneDelegate`). This is the direction Apple/Expo are pushing
 * every app ("Required by iOS 27"), and it is the exact configuration behind the crash-handler
 * freeze in getsentry/sentry-cocoa#9281 — so by being the sample's normal config, it keeps that bug
 * class exercised by regular CI.
 *
 * Since Expo 58 the prebuild template adopts the scene lifecycle itself, so this plugin only guards
 * against template drift (fails prebuild if the scene manifest is gone) and injects the test hook.
 *
 * The test hook is used by the crash-handler regression check
 * (scripts/verify-ios-crash-screenshot-no-freeze.sh): when the app is launched with the runtime
 * env var `SENTRY_TEST_ABORT=1`, it crashes via `abort()` on a background thread a few seconds
 * after launch. SentryCrash then handles the signal off the main thread, forcing the crash-time
 * screenshot to read the MainActor `window` getter off-main — which hangs on an unfixed cocoa and
 * terminates cleanly on a fixed one. The hook is inert unless that env var is set, so it never
 * affects normal runs.
 */
const { withInfoPlist, withAppDelegate } = require('@expo/config-plugins');

function withSceneManifestGuard(config) {
  return withInfoPlist(config, cfg => {
    const delegateClass =
      cfg.modResults.UIApplicationSceneManifest?.UISceneConfigurations?.UIWindowSceneSessionRoleApplication?.[0]
        ?.UISceneDelegateClassName;
    if (!delegateClass) {
      throw new Error('[withIosSceneLifecycle] UIApplicationSceneManifest not found; Expo template changed.');
    }
    return cfg;
  });
}

function patchAppDelegate(contents) {
  if (contents.includes('SENTRY_TEST_ABORT')) {
    return contents;
  }

  const anchor = /^([ \t]*)return super\.application\(application, didFinishLaunchingWithOptions: launchOptions\)/m;
  if (!anchor.test(contents)) {
    throw new Error('[withIosSceneLifecycle] didFinishLaunching return not found; Expo template changed.');
  }
  return contents.replace(anchor, (match, indent) =>
    [
      '',
      `${indent}// [withIosSceneLifecycle] Test hook for the crash-handler regression check (sentry-cocoa#9281):`,
      `${indent}// when launched with SENTRY_TEST_ABORT=1, crash on a background thread so SentryCrash's inline`,
      `${indent}// handler runs off the main thread and the crash-time screenshot reads the MainActor window`,
      `${indent}// getter off-main. Inert unless the env var is set.`,
      `${indent}if ProcessInfo.processInfo.environment["SENTRY_TEST_ABORT"] == "1" {`,
      `${indent}  DispatchQueue.global().asyncAfter(deadline: .now() + 8.0) { abort() }`,
      `${indent}}`,
      '',
      match,
    ].join('\n'),
  );
}

function withTestHookAppDelegate(config) {
  return withAppDelegate(config, cfg => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('[withIosSceneLifecycle] expected a Swift AppDelegate.');
    }
    cfg.modResults.contents = patchAppDelegate(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = function withIosSceneLifecycle(config) {
  config = withSceneManifestGuard(config);
  config = withTestHookAppDelegate(config);
  return config;
};
