/* oxlint-disable typescript-eslint(no-unsafe-member-access) */
import type { ExpoConfig } from '@expo/config-types';
import type { ConfigPlugin, XcodeProject } from 'expo/config-plugins';

import { withAppDelegate, withDangerousMod, withXcodeProject } from 'expo/config-plugins';
import * as path from 'path';

import { warnOnce } from './logger';
import { writeSentryPropertiesTo } from './utils';

type BuildPhase = { shellScript: string };

const SENTRY_REACT_NATIVE_XCODE_PATH =
  "`\"$NODE_BINARY\" --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'\"`";
const SENTRY_REACT_NATIVE_XCODE_DEBUG_FILES_PATH =
  "`${NODE_BINARY:-node} --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode-debug-files.sh'\"`";
const SENTRY_DISABLE_AUTO_UPLOAD_EXPORT = 'export SENTRY_DISABLE_AUTO_UPLOAD=true';

export const withSentryIOS: ConfigPlugin<{
  sentryProperties: string;
  useNativeInit: boolean | undefined;
  disableAutoUpload: boolean | undefined;
}> = (config, { sentryProperties, useNativeInit = false, disableAutoUpload = false }) => {
  const xcodeProjectCfg = withXcodeProject(config, config => {
    const xcodeProject: XcodeProject = config.modResults;

    const sentryBuildPhase = xcodeProject.pbxItemByComment(
      'Upload Debug Symbols to Sentry',
      'PBXShellScriptBuildPhase',
    );
    if (!sentryBuildPhase) {
      const debugFilesScript = disableAutoUpload
        ? `${SENTRY_DISABLE_AUTO_UPLOAD_EXPORT}\n/bin/sh ${SENTRY_REACT_NATIVE_XCODE_DEBUG_FILES_PATH}`
        : `/bin/sh ${SENTRY_REACT_NATIVE_XCODE_DEBUG_FILES_PATH}`;
      xcodeProject.addBuildPhase([], 'PBXShellScriptBuildPhase', 'Upload Debug Symbols to Sentry', null, {
        shellPath: '/bin/sh',
        shellScript: debugFilesScript,
      });
    } else if (disableAutoUpload) {
      addDisableAutoUploadToExistingScript(sentryBuildPhase);
    } else {
      removeDisableAutoUploadFromExistingScript(sentryBuildPhase);
    }

    const bundleReactNativePhase = xcodeProject.pbxItemByComment(
      'Bundle React Native code and images',
      'PBXShellScriptBuildPhase',
    );
    modifyExistingXcodeBuildScript(bundleReactNativePhase, disableAutoUpload);

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

export function modifyExistingXcodeBuildScript(script: BuildPhase, disableAutoUpload: boolean = false): void {
  if (!script.shellScript.match(/(packager|scripts)\/react-native-xcode\.sh\b/)) {
    warnOnce(
      `'react-native-xcode.sh' not found in 'Bundle React Native code and images'.
Please open a bug report at https://github.com/getsentry/sentry-react-native`,
    );
    return;
  }

  if (script.shellScript.includes('sentry-xcode.sh')) {
    if (disableAutoUpload) {
      addDisableAutoUploadToExistingScript(script);
    } else {
      removeDisableAutoUploadFromExistingScript(script);
    }
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
  script.shellScript = JSON.stringify(addSentryWithBundledScriptsToBundleShellScript(code, disableAutoUpload));
}

export function addSentryWithBundledScriptsToBundleShellScript(
  script: string,
  disableAutoUpload: boolean = false,
): string {
  const disableAutoUploadExport = disableAutoUpload ? `${SENTRY_DISABLE_AUTO_UPLOAD_EXPORT}\n` : '';
  return script.replace(
    /^.*?(packager|scripts)\/react-native-xcode\.sh\s*(\\'\\\\")?/m,
    (match: string) => `${disableAutoUploadExport}/bin/sh ${SENTRY_REACT_NATIVE_XCODE_PATH} ${match}`,
  );
}

export function addDisableAutoUploadToExistingScript(script: BuildPhase): void {
  if (script.shellScript.includes('SENTRY_DISABLE_AUTO_UPLOAD')) {
    return;
  }
  try {
    const code = JSON.parse(script.shellScript);
    script.shellScript = JSON.stringify(insertExportAfterDelimiter(code));
  } catch {
    script.shellScript = `${SENTRY_DISABLE_AUTO_UPLOAD_EXPORT}\n${script.shellScript}`;
  }
}

function insertExportAfterDelimiter(script: string): string {
  if (script.startsWith('"')) {
    const rest = script.slice(1).replace(/^\n/, '');
    return `"\n${SENTRY_DISABLE_AUTO_UPLOAD_EXPORT}\n${rest}`;
  }
  return `${SENTRY_DISABLE_AUTO_UPLOAD_EXPORT}\n${script}`;
}

export function removeDisableAutoUploadFromExistingScript(script: BuildPhase): void {
  if (!script.shellScript.includes('SENTRY_DISABLE_AUTO_UPLOAD')) {
    return;
  }
  try {
    const code = JSON.parse(script.shellScript);
    script.shellScript = JSON.stringify(code.replace(/^export SENTRY_DISABLE_AUTO_UPLOAD=true\n?/m, ''));
  } catch {
    script.shellScript = script.shellScript.replace(/^export SENTRY_DISABLE_AUTO_UPLOAD=true\n?/m, '');
  }
}

export function modifyAppDelegate(config: ExpoConfig): ExpoConfig {
  return withAppDelegate(config, async config => {
    if (!config.modResults?.path) {
      warnOnce("Can't add 'RNSentrySDK.start()' to the iOS AppDelegate, because the file was not found.");
      return config;
    }

    const fileName = path.basename(config.modResults.path);

    if (config.modResults.language === 'swift') {
      if (config.modResults.contents.includes('RNSentrySDK.start()')) {
        warnOnce(`Your '${fileName}' already contains 'RNSentrySDK.start()'.`);
        return config;
      }
      // Add RNSentrySDK.start() at the beginning of application method
      const originalContents = config.modResults.contents;
      config.modResults.contents = config.modResults.contents.replace(
        /(func application\([^)]*\) -> Bool \{)\s*\n(\s*)/s,
        '$1\n$2RNSentrySDK.start()\n$2',
      );
      if (config.modResults.contents === originalContents) {
        warnOnce(`Failed to insert 'RNSentrySDK.start()' in '${fileName}'.`);
      } else if (!config.modResults.contents.includes('import RNSentry')) {
        // Insert import statement after the first import (works for both UIKit and Expo imports)
        config.modResults.contents = config.modResults.contents.replace(/(import \S+\n)/, '$1import RNSentry\n');
      }
    } else if (['objcpp', 'objc'].includes(config.modResults.language)) {
      if (config.modResults.contents.includes('[RNSentrySDK start]')) {
        warnOnce(`Your '${fileName}' already contains '[RNSentrySDK start]'.`);
        return config;
      }
      // Add [RNSentrySDK start] at the beginning of application:didFinishLaunchingWithOptions method
      const originalContents = config.modResults.contents;
      config.modResults.contents = config.modResults.contents.replace(
        /(- \(BOOL\)application:[\s\S]*?didFinishLaunchingWithOptions:[\s\S]*?\{\n)(\s*)/s,
        '$1$2[RNSentrySDK start];\n$2',
      );
      if (config.modResults.contents === originalContents) {
        warnOnce(`Failed to insert '[RNSentrySDK start]' in '${fileName}.`);
      } else if (!config.modResults.contents.includes('#import <RNSentry/RNSentry.h>')) {
        // Add import after AppDelegate.h
        config.modResults.contents = config.modResults.contents.replace(
          /(#import "AppDelegate.h"\n)/,
          '$1#import <RNSentry/RNSentry.h>\n',
        );
      }
    } else {
      warnOnce(
        `Unsupported language '${config.modResults.language}' detected in '${fileName}', the native code won't be updated.`,
      );
    }

    return config;
  });
}
