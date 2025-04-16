import type { ExpoConfig } from '@expo/config-types';
import type { ConfigPlugin } from 'expo/config-plugins';
import { withAppBuildGradle, withDangerousMod, withMainApplication } from 'expo/config-plugins';
import * as path from 'path';

import { warnOnce, writeSentryPropertiesTo } from './utils';

export const withSentryAndroid: ConfigPlugin<{ sentryProperties: string; useNativeInit: boolean | undefined }> = (
  config,
  { sentryProperties, useNativeInit = true },
) => {
  const appBuildGradleCfg = withAppBuildGradle(config, config => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents = modifyAppBuildGradle(config.modResults.contents);
    } else {
      throw new Error('Cannot configure Sentry in the app gradle because the build.gradle is not groovy');
    }
    return config;
  });

  const mainApplicationCfg = useNativeInit ? modifyMainApplication(appBuildGradleCfg) : appBuildGradleCfg;

  return withDangerousMod(mainApplicationCfg, [
    'android',
    config => {
      writeSentryPropertiesTo(path.resolve(config.modRequest.projectRoot, 'android'), sentryProperties);
      return config;
    },
  ]);
};

const resolveSentryReactNativePackageJsonPath =
  '["node", "--print", "require(\'path\').dirname(require.resolve(\'@sentry/react-native/package.json\'))"].execute().text.trim()';

/**
 * Writes to projectDirectory/android/app/build.gradle,
 * adding the relevant @sentry/react-native script.
 */
export function modifyAppBuildGradle(buildGradle: string): string {
  if (buildGradle.includes('sentry.gradle')) {
    return buildGradle;
  }

  // Use the same location that sentry-wizard uses
  // See: https://github.com/getsentry/sentry-wizard/blob/e9b4522f27a852069c862bd458bdf9b07cab6e33/lib/Steps/Integrations/ReactNative.ts#L232
  const pattern = /^android {/m;

  if (!buildGradle.match(pattern)) {
    warnOnce(
      'Could not find `^android {` in `android/app/build.gradle`. Please open a bug report at https://github.com/getsentry/sentry-react-native.',
    );
    return buildGradle;
  }

  const applyFrom = `apply from: new File(${resolveSentryReactNativePackageJsonPath}, "sentry.gradle")`;

  return buildGradle.replace(pattern, match => `${applyFrom}\n\n${match}`);
}

export function modifyMainApplication(config: ExpoConfig): ExpoConfig {
  return withMainApplication(config, async config => {
    if (!config.modResults || !config.modResults.path) {
      warnOnce("Can't add 'RNSentrySDK.init' to Android MainApplication, because the file was not found.");
      return config;
    }

    const fileName = path.basename(config.modResults.path);

    if (config.modResults.contents.includes('RNSentrySDK.init')) {
      warnOnce(`Your '${fileName}' already contains 'RNSentrySDK.init', the native code won't be updated.`);
      return config;
    }

    if (config.modResults.language === 'java') {
      if (!config.modResults.contents.includes('import io.sentry.react.RNSentrySDK;')) {
        // Insert import statement after package declaration
        config.modResults.contents = config.modResults.contents.replace(
          /(package .*;\n\n?)/,
          `$1import io.sentry.react.RNSentrySDK;\n`,
        );
      }
      // Add RNSentrySDK.init
      const originalContents = config.modResults.contents;
      config.modResults.contents = config.modResults.contents.replace(
        /(super\.onCreate\(\)[;\n]*)([ \t]*)/,
        `$1\n$2RNSentrySDK.init(this);\n$2`,
      );
      if (config.modResults.contents === originalContents) {
        warnOnce(`Failed to insert 'RNSentrySDK.init' in '${fileName}'.`);
      }
    } else if (config.modResults.language === 'kt') {
      if (!config.modResults.contents.includes('import io.sentry.react.RNSentrySDK')) {
        // Insert import statement after package declaration
        config.modResults.contents = config.modResults.contents.replace(
          /(package .*\n\n?)/,
          `$1import io.sentry.react.RNSentrySDK\n`,
        );
      }
      // Add RNSentrySDK.init
      const originalContents = config.modResults.contents;
      config.modResults.contents = config.modResults.contents.replace(
        /(super\.onCreate\(\)[;\n]*)([ \t]*)/,
        `$1\n$2RNSentrySDK.init(this)\n$2`,
      );
      if (config.modResults.contents === originalContents) {
        warnOnce(`Failed to insert 'RNSentrySDK.init' in '${fileName}'.`);
      }
    } else {
      warnOnce(`Unrecognized language detected in '${fileName}', the native code won't be updated.`);
    }

    return config;
  });
}
