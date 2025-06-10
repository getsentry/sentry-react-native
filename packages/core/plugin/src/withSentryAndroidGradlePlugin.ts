import { withAppBuildGradle, withProjectBuildGradle } from '@expo/config-plugins';

import { warnOnce } from './utils';

export interface SentryAndroidGradlePluginOptions {
  enableAndroidGradlePlugin?: boolean;
  includeProguardMapping?: boolean;
  dexguardEnabled?: boolean;
  autoUploadNativeSymbols?: boolean;
  autoUploadProguardMapping?: boolean;
  uploadNativeSymbols?: boolean;
  includeNativeSources?: boolean;
  includeSourceContext?: boolean;
}

/**
 * Adds the Sentry Android Gradle Plugin to the project.
 * https://docs.sentry.io/platforms/react-native/manual-setup/manual-setup/#enable-sentry-agp
 */
export function withSentryAndroidGradlePlugin(
  config: any,
  {
    includeProguardMapping = true,
    dexguardEnabled = false,
    autoUploadProguardMapping = true,
    uploadNativeSymbols = true,
    autoUploadNativeSymbols = true,
    includeNativeSources = true,
    includeSourceContext = false,
  }: SentryAndroidGradlePluginOptions = {},
): any {
  const version = '4.14.1';

  // Modify android/build.gradle
  const withSentryProjectBuildGradle = (config: any): any => {
    return withProjectBuildGradle(config, (projectBuildGradle: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!projectBuildGradle.modResults || !projectBuildGradle.modResults.contents) {
        warnOnce('android/build.gradle content is missing or undefined.');
        return config;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (projectBuildGradle.modResults.language !== 'groovy') {
        warnOnce('Cannot configure Sentry in android/build.gradle because it is not in Groovy.');
        return config;
      }

      const dependency = `classpath("io.sentry:sentry-android-gradle-plugin:${version}")`;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (projectBuildGradle.modResults.contents.includes(dependency)) {
        warnOnce('sentry-android-gradle-plugin dependency in already in android/build.gradle.');
        return config;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const updatedContents = projectBuildGradle.modResults.contents.replace(
          /dependencies\s*{/,
          `dependencies {\n        ${dependency}`,
        );
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (updatedContents === projectBuildGradle.modResults.contents) {
          warnOnce('Failed to inject the dependency. Could not find `dependencies` in build.gradle.');
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          projectBuildGradle.modResults.contents = updatedContents;
        }
      } catch (error) {
        warnOnce(`An error occurred while trying to modify build.gradle`);
      }
      return projectBuildGradle;
    });
  };

  // Modify android/app/build.gradle
  const withSentryAppBuildGradle = (config: any): any => {
    return withAppBuildGradle(config, (config: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (config.modResults.language !== 'groovy') {
        warnOnce('Cannot configure Sentry in android/app/build.gradle because it is not in Groovy.');
        return config;
      }
      const sentryPlugin = `apply plugin: "io.sentry.android.gradle"`;
      const sentryConfig = `
  sentry {
      autoUploadProguardMapping = ${autoUploadProguardMapping ? 'shouldSentryAutoUpload()' : 'false'}
      includeProguardMapping = ${includeProguardMapping}
      dexguardEnabled = ${dexguardEnabled}
      uploadNativeSymbols = ${uploadNativeSymbols ? 'shouldSentryAutoUpload()' : 'false'}
      autoUploadNativeSymbols = ${autoUploadNativeSymbols ? 'shouldSentryAutoUpload()' : 'false'}
      includeNativeSources = ${includeNativeSources}
      includeSourceContext = ${includeSourceContext ? 'shouldSentryAutoUpload()' : 'false'}
      tracingInstrumentation {
          enabled = false
      }
      autoInstallation {
          enabled = false
      }
  }`;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      let contents = config.modResults.contents;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!contents.includes(sentryPlugin)) {
        contents = `${sentryPlugin}\n${contents}`;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!contents.includes('sentry {')) {
        contents = `${contents}\n${sentryConfig}`;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      config.modResults.contents = contents;
      return config;
    });
  };

  return withSentryAppBuildGradle(withSentryProjectBuildGradle(config));
}
