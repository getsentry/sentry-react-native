import { withAppBuildGradle, withProjectBuildGradle } from '@expo/config-plugins';
import type { ExpoConfig } from '@expo/config-types';
import { warnOnce } from './logger';

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

export const sentryAndroidGradlePluginVersion = '6.1.0';

/**
 * Adds the Sentry Android Gradle Plugin to the project.
 * https://docs.sentry.io/platforms/react-native/manual-setup/manual-setup/#enable-sentry-agp
 */
export function withSentryAndroidGradlePlugin(
  config: ExpoConfig,
  {
    includeProguardMapping = true,
    dexguardEnabled = false,
    autoUploadProguardMapping = true,
    uploadNativeSymbols = true,
    autoUploadNativeSymbols = true,
    includeNativeSources = true,
    includeSourceContext = false,
  }: SentryAndroidGradlePluginOptions = {},
): ExpoConfig {
  // Modify android/build.gradle
  const withSentryProjectBuildGradle = (config: ExpoConfig): ExpoConfig => {
    return withProjectBuildGradle(config, projectBuildGradle => {
      if (!projectBuildGradle.modResults?.contents) {
        warnOnce('android/build.gradle content is missing or undefined.');
        return projectBuildGradle;
      }
      if (projectBuildGradle.modResults.language !== 'groovy') {
        warnOnce('Cannot configure Sentry in android/build.gradle because it is not in Groovy.');
        return projectBuildGradle;
      }

      const dependency = `classpath("io.sentry:sentry-android-gradle-plugin:${sentryAndroidGradlePluginVersion}")`;

      if (projectBuildGradle.modResults.contents.includes(dependency)) {
        warnOnce('sentry-android-gradle-plugin dependency in already in android/build.gradle.');
        return projectBuildGradle;
      }

      try {
        const updatedContents = projectBuildGradle.modResults.contents.replace(
          /dependencies\s*{/,
          `dependencies {\n        ${dependency}`,
        );
        if (updatedContents === projectBuildGradle.modResults.contents) {
          warnOnce('Failed to inject the dependency. Could not find `dependencies` in build.gradle.');
        } else {
          projectBuildGradle.modResults.contents = updatedContents;
        }
      } catch (error) {
        warnOnce('An error occurred while trying to modify build.gradle');
      }
      return projectBuildGradle;
    });
  };

  // Modify android/app/build.gradle
  const withSentryAppBuildGradle = (config: ExpoConfig): ExpoConfig => {
    return withAppBuildGradle(config, appBuildGradle => {
      if (appBuildGradle.modResults.language !== 'groovy') {
        warnOnce('Cannot configure Sentry in android/app/build.gradle because it is not in Groovy.');
        return appBuildGradle;
      }
      const sentryPlugin = 'apply plugin: "io.sentry.android.gradle"';
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

      let contents = appBuildGradle.modResults.contents;

      if (!contents.includes(sentryPlugin)) {
        contents = `${sentryPlugin}\n${contents}`;
      }

      if (!contents.includes('sentry {')) {
        contents = `${contents}\n${sentryConfig}`;
      }

      appBuildGradle.modResults.contents = contents;
      return appBuildGradle;
    });
  };

  return withSentryAppBuildGradle(withSentryProjectBuildGradle(config));
}
