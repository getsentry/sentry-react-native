import type { ExpoConfig } from '@expo/config-types';
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { ConfigPlugin, XcodeProject } from 'expo/config-plugins';
import { withAppDelegate, withDangerousMod, withXcodeProject } from 'expo/config-plugins';
import * as path from 'path';

import { warnOnce, writeSentryPropertiesTo } from './utils';

type BuildPhase = { shellScript: string };

const SENTRY_REACT_NATIVE_XCODE_PATH =
  "`\"$NODE_BINARY\" --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'\"`";
const SENTRY_REACT_NATIVE_XCODE_DEBUG_FILES_PATH =
  "`${NODE_BINARY:-node} --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode-debug-files.sh'\"`";

export const withSentryIOS: ConfigPlugin<{ sentryProperties: string; useNativeInit: boolean | undefined }> = (
  config,
  { sentryProperties, useNativeInit = true },
) => {
  const xcodeProjectCfg = withXcodeProject(config, config => {
    const xcodeProject: XcodeProject = config.modResults;

    const sentryBuildPhase = xcodeProject.pbxItemByComment(
      'Upload Debug Symbols to Sentry',
      'PBXShellScriptBuildPhase',
    );
    if (!sentryBuildPhase) {
      xcodeProject.addBuildPhase([], 'PBXShellScriptBuildPhase', 'Upload Debug Symbols to Sentry', null, {
        shellPath: '/bin/sh',
        shellScript: `/bin/sh ${SENTRY_REACT_NATIVE_XCODE_DEBUG_FILES_PATH}`,
      });
    }

    const bundleReactNativePhase = xcodeProject.pbxItemByComment(
      'Bundle React Native code and images',
      'PBXShellScriptBuildPhase',
    );
    modifyExistingXcodeBuildScript(bundleReactNativePhase);

    return config;
  });

  const appDelegateCfc = useNativeInit ? modifyAppDelegate(xcodeProjectCfg) : xcodeProjectCfg;

  return withDangerousMod(appDelegateCfc, [
    'ios',
    config => {
      writeSentryPropertiesTo(path.resolve(config.modRequest.projectRoot, 'ios'), sentryProperties);
      return config;
    },
  ]);
};

export function modifyExistingXcodeBuildScript(script: BuildPhase): void {
  if (!script.shellScript.match(/(packager|scripts)\/react-native-xcode\.sh\b/)) {
    warnOnce(
      `'react-native-xcode.sh' not found in 'Bundle React Native code and images'.
Please open a bug report at https://github.com/getsentry/sentry-react-native`,
    );
    return;
  }

  if (script.shellScript.includes('sentry-xcode.sh')) {
    warnOnce("The latest 'sentry-xcode.sh' script already exists in 'Bundle React Native code and images'.");
    return;
  }

  if (script.shellScript.includes('@sentry')) {
    warnOnce(
      `Outdated or custom Sentry script found in 'Bundle React Native code and images'.
Regenerate the native project to use the latest script.
Run npx expo prebuild --clean`,
    );
    return;
  }

  const code = JSON.parse(script.shellScript);
  script.shellScript = JSON.stringify(addSentryWithBundledScriptsToBundleShellScript(code));
}

export function addSentryWithBundledScriptsToBundleShellScript(script: string): string {
  return script.replace(
    /^.*?(packager|scripts)\/react-native-xcode\.sh\s*(\\'\\\\")?/m,
    // eslint-disable-next-line no-useless-escape
    (match: string) => `/bin/sh ${SENTRY_REACT_NATIVE_XCODE_PATH} ${match}`,
  );
}

export function modifyAppDelegate(config: ExpoConfig): ExpoConfig {
  return withAppDelegate(config, async config => {
    if (!config.modResults || !config.modResults.path) {
      warnOnce('Skipping AppDelegate modification because the file does not exist.');
      return config;
    }

    const fileName = path.basename(config.modResults.path);

    if (config.modResults.language === 'swift') {
      if (config.modResults.contents.includes('RNSentrySDK.start()')) {
        warnOnce(`Your '${fileName}' already contains 'RNSentrySDK.start()'.`);
        return config;
      }
      if (!config.modResults.contents.includes('import RNSentry')) {
        // Insert import statement after UIKit import
        config.modResults.contents = config.modResults.contents.replace(/(import UIKit\n)/, `$1import RNSentry\n`);
      }
      // Add RNSentrySDK.start() at the beginning of application method
      const originalContents = config.modResults.contents;
      config.modResults.contents = config.modResults.contents.replace(
        /(func application\([^)]*\) -> Bool \{)/s,
        `$1\n    RNSentrySDK.start()`,
      );
      if (config.modResults.contents === originalContents) {
        warnOnce(`Failed to insert 'RNSentrySDK.start()'.`);
      }
    } else {
      // Objective-C
      if (config.modResults.contents.includes('[RNSentrySDK start]')) {
        warnOnce(`Your '${fileName}' already contains '[RNSentrySDK start]'.`);
        return config;
      }
      if (!config.modResults.contents.includes('#import <RNSentry/RNSentry.h>')) {
        // Add import after AppDelegate.h
        config.modResults.contents = config.modResults.contents.replace(
          /(#import "AppDelegate.h"\n)/,
          `$1#import <RNSentry/RNSentry.h>\n`,
        );
      }
      // Add [RNSentrySDK start] at the beginning of application:didFinishLaunchingWithOptions method
      const originalContents = config.modResults.contents;
      config.modResults.contents = config.modResults.contents.replace(
        /(- \(BOOL\)application:[\s\S]*?didFinishLaunchingWithOptions:[\s\S]*?\{\n)(\s*)/s,
        `$1$2[RNSentrySDK start];\n$2`,
      );
      if (config.modResults.contents === originalContents) {
        warnOnce(`Failed to insert '[RNSentrySDK start]'.`);
      }
    }

    return config;
  });
}
