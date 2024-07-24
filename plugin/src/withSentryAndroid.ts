import type { ConfigPlugin } from 'expo/config-plugins';
import { withAppBuildGradle, withDangerousMod } from 'expo/config-plugins';
import * as path from 'path';

import { warnOnce, writeSentryPropertiesTo } from './utils';

export const withSentryAndroid: ConfigPlugin<string> = (config, sentryProperties: string) => {
  const cfg = withAppBuildGradle(config, config => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents = modifyAppBuildGradle(config.modResults.contents);
    } else {
      throw new Error('Cannot configure Sentry in the app gradle because the build.gradle is not groovy');
    }
    return config;
  });
  return withDangerousMod(cfg, [
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
