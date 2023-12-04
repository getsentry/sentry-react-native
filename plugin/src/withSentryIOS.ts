/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { ConfigPlugin, XcodeProject } from 'expo/config-plugins';
import { WarningAggregator, withDangerousMod, withXcodeProject } from 'expo/config-plugins';
import * as path from 'path';

import { SDK_PACKAGE_NAME, writeSentryPropertiesTo } from './utils';

type BuildPhase = { shellScript: string };

const SENTRY_REACT_NATIVE_XCODE_PATH =
  "`\"$NODE_BINARY\" --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'\"`";
const SENTRY_REACT_NATIVE_XCODE_DEBUG_FILES_PATH =
  "`${NODE_BINARY:-node} --print \"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode-debug-files.sh'\"`";

export const withSentryIOS: ConfigPlugin<string> = (config, sentryProperties: string) => {
  const cfg = withXcodeProject(config, config => {
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

  return withDangerousMod(cfg, [
    'ios',
    config => {
      writeSentryPropertiesTo(path.resolve(config.modRequest.projectRoot, 'ios'), sentryProperties);
      return config;
    },
  ]);
};

export function modifyExistingXcodeBuildScript(script: BuildPhase): void {
  if (
    !script.shellScript.match(/(packager|scripts)\/react-native-xcode\.sh\b/) ||
    script.shellScript.includes('sentry-xcode.sh') ||
    script.shellScript.includes('@sentry')
  ) {
    WarningAggregator.addWarningIOS(
      SDK_PACKAGE_NAME,
      "Unable to modify build script 'Bundle React Native code and images'. Please open a bug report at https://github.com/expo/sentry-expo.",
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
