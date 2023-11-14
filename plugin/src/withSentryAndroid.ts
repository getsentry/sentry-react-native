import {
  ConfigPlugin,
  WarningAggregator,
  withAppBuildGradle,
  withDangerousMod,
} from 'expo/config-plugins';
import * as path from 'path';

import { writeSentryPropertiesTo } from './withSentryIOS';

export const withSentryAndroid: ConfigPlugin<string> = (config, sentryProperties: string) => {
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents = modifyAppBuildGradle(config.modResults.contents);
    } else {
      throw new Error(
        'Cannot configure Sentry in the app gradle because the build.gradle is not groovy'
      );
    }
    return config;
  });
  return withDangerousMod(config, [
    'android',
    (config) => {
      writeSentryPropertiesTo(
        path.resolve(config.modRequest.projectRoot, 'android'),
        sentryProperties
      );
      return config;
    },
  ]);
};

const resolveSentryReactNativePackageJsonPath = `["node", "--print", "require.resolve('@sentry/react-native/package.json')"].execute().text.trim()`;

/**
 * Writes to projectDirectory/android/app/build.gradle,
 * adding the relevant @sentry/react-native script.
 */
export function modifyAppBuildGradle(buildGradle: string) {
  if (buildGradle.includes('/sentry.gradle"')) {
    return buildGradle;
  }

  // Use the same location that sentry-wizard uses
  // See: https://github.com/getsentry/sentry-wizard/blob/e9b4522f27a852069c862bd458bdf9b07cab6e33/lib/Steps/Integrations/ReactNative.ts#L232
  const pattern = /^android {/m;

  if (!buildGradle.match(pattern)) {
    WarningAggregator.addWarningAndroid(
      'sentry-expo',
      'Could not find react.gradle script in android/app/build.gradle. Please open a bug report at https://github.com/expo/sentry-expo.'
    );
  }

  const sentryOptions = !buildGradle.includes('project.ext.sentryCli')
    ? `project.ext.sentryCli=[collectModulesScript: new File(${resolveSentryReactNativePackageJsonPath}, "../dist/js/tools/collectModules.js")]`
    : '';
  const applyFrom = `apply from: new File(${resolveSentryReactNativePackageJsonPath}, "../sentry.gradle")`;
  
  return buildGradle.replace(
    pattern,
    match => sentryOptions + '\n\n' + applyFrom + '\n\n' + match
  );
}
