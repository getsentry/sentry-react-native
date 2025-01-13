import { withAppBuildGradle, withProjectBuildGradle } from '@expo/config-plugins';

export interface SentryAndroidGradlePluginOptions {
  sentryAndroidGradlePluginVersion?: string;
  uploadNativeSymbols?: boolean;
  includeNativeSources?: boolean;
  autoInstallationEnabled?: boolean;
}

/**
 * Adds the Sentry Android Gradle Plugin to the project.
 * https://docs.sentry.io/platforms/react-native/manual-setup/manual-setup/#enable-sentry-agp
 */
export function withSentryAndroidGradlePlugin(config: any, options: SentryAndroidGradlePluginOptions = {}): any {
  const version = options.sentryAndroidGradlePluginVersion;
  const uploadNativeSymbols = options.uploadNativeSymbols ?? true;
  const includeNativeSources = options.includeNativeSources ?? true;
  const autoInstallationEnabled = options.autoInstallationEnabled ?? false;

  // Modify android/build.gradle
  const withSentryProjectBuildGradle = (config: any): any => {
    return withProjectBuildGradle(config, (projectBuildGradle: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!projectBuildGradle.modResults || !projectBuildGradle.modResults.contents) {
        throw new Error('android/build.gradle content is missing or undefined.');
      }

      const dependency = `classpath("io.sentry:sentry-android-gradle-plugin:${version}")`;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!projectBuildGradle.modResults.contents.includes(dependency)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        projectBuildGradle.modResults.contents = projectBuildGradle.modResults.contents.replace(
          /dependencies\s*{/,
          `dependencies {\n        ${dependency}`,
        );
      }

      return projectBuildGradle;
    });
  };

  // Modify android/app/build.gradle
  const withSentryAppBuildGradle = (config: any): any => {
    return withAppBuildGradle(config, (config: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (config.modResults.language === 'groovy') {
        const sentryPlugin = `apply plugin: "io.sentry.android.gradle"`;
        const sentryConfig = `
  sentry {
      uploadNativeSymbols = ${uploadNativeSymbols}
      includeNativeSources = ${includeNativeSources}
      autoInstallation {
          enabled = ${autoInstallationEnabled}
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
      } else {
        throw new Error('Cannot configure Sentry in android/app/build.gradle because it is not in Groovy.');
      }
      return config;
    });
  };

  return withSentryAppBuildGradle(withSentryProjectBuildGradle(config));
}
