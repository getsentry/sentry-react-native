import { withAppBuildGradle, withProjectBuildGradle } from '@expo/config-plugins';

import { warnOnce } from '../../plugin/src/utils';
import type { SentryAndroidGradlePluginOptions } from '../../plugin/src/withSentryAndroidGradlePlugin';
import { withSentryAndroidGradlePlugin } from '../../plugin/src/withSentryAndroidGradlePlugin';

jest.mock('@expo/config-plugins', () => ({
  withProjectBuildGradle: jest.fn(),
  withAppBuildGradle: jest.fn(),
}));

jest.mock('../../plugin/src/utils', () => ({
  warnOnce: jest.fn(),
}));

const mockedBuildGradle = `
buildscript {
    dependencies {
        classpath('otherDependency')
    }
}
`;

const mockedAppBuildGradle = `
apply plugin: "somePlugin"
react {
}
android {
}
dependencies {
}
`;

describe('withSentryAndroidGradlePlugin', () => {
  const mockConfig = {
    name: 'test-app',
    slug: 'test-app',
    modResults: { contents: '' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adds the Sentry plugin to build.gradle when enableAndroidGradlePlugin is enabled', () => {
    const version = '4.14.1';
    const options: SentryAndroidGradlePluginOptions = { enableAndroidGradlePlugin: true };

    (withProjectBuildGradle as jest.Mock).mockImplementation((config, callback) => {
      const projectBuildGradle = {
        modResults: { language: 'groovy', contents: mockedBuildGradle },
      };
      const modified = callback(projectBuildGradle);
      return modified;
    });

    withSentryAndroidGradlePlugin(mockConfig, options);

    expect(withProjectBuildGradle).toHaveBeenCalled();
    expect(withProjectBuildGradle).toHaveBeenCalledWith(expect.any(Object), expect.any(Function));

    const calledCallback = (withProjectBuildGradle as jest.Mock).mock.calls[0][1];
    const modifiedGradle = calledCallback({
      modResults: { language: 'groovy', contents: mockedBuildGradle },
    });

    expect(modifiedGradle.modResults.contents).toContain(
      `classpath("io.sentry:sentry-android-gradle-plugin:${version}")`,
    );
  });

  it('warnOnce if the Sentry plugin is already included in build.gradle', () => {
    const version = '4.14.1';
    const includedBuildGradle = `dependencies { classpath("io.sentry:sentry-android-gradle-plugin:${version}")}`;
    const options: SentryAndroidGradlePluginOptions = { enableAndroidGradlePlugin: true };

    (withProjectBuildGradle as jest.Mock).mockImplementation((config, callback) => {
      callback({ modResults: { language: 'groovy', contents: includedBuildGradle } });
    });

    withSentryAndroidGradlePlugin(mockConfig, options);

    expect(warnOnce).toHaveBeenCalledWith(
      'sentry-android-gradle-plugin dependency in already in android/build.gradle.',
    );
  });

  it('warnOnce if failed to modify build.gradle', () => {
    const invalidBuildGradle = `android {}`;
    const options: SentryAndroidGradlePluginOptions = { enableAndroidGradlePlugin: true };

    (withProjectBuildGradle as jest.Mock).mockImplementation((config, callback) => {
      callback({ modResults: { language: 'groovy', contents: invalidBuildGradle } });
    });

    withSentryAndroidGradlePlugin(mockConfig, options);

    expect(warnOnce).toHaveBeenCalledWith(
      'Failed to inject the dependency. Could not find `dependencies` in build.gradle.',
    );
  });

  it('adds the Sentry plugin configuration to app/build.gradle', () => {
    const options: SentryAndroidGradlePluginOptions = {
      autoUploadProguardMapping: true,
      includeProguardMapping: true,
      dexguardEnabled: false,
      uploadNativeSymbols: true,
      autoUploadNativeSymbols: true,
      includeNativeSources: false,
      includeSourceContext: true,
    };
    (withProjectBuildGradle as jest.Mock).mockImplementation((config, callback) => {
      const projectBuildGradle = {
        modResults: { language: 'groovy', contents: mockedBuildGradle },
      };
      const modified = callback(projectBuildGradle);
      return modified;
    });
    (withAppBuildGradle as jest.Mock).mockImplementation((config, callback) => {
      const appBuildGradle = {
        modResults: { language: 'groovy', contents: mockedAppBuildGradle },
      };
      const modified = callback(appBuildGradle);
      return modified;
    });

    withSentryAndroidGradlePlugin(mockConfig, options);

    expect(withAppBuildGradle).toHaveBeenCalled();
    expect(withAppBuildGradle).toHaveBeenCalledWith(expect.any(Object), expect.any(Function));

    const calledCallback = (withAppBuildGradle as jest.Mock).mock.calls[0][1];
    const modifiedGradle = calledCallback({
      modResults: { language: 'groovy', contents: mockedAppBuildGradle },
    });

    expect(modifiedGradle.modResults.contents).toContain('apply plugin: "io.sentry.android.gradle"');
    expect(modifiedGradle.modResults.contents).toContain(`
  sentry {
      autoUploadProguardMapping = shouldSentryAutoUpload()
      includeProguardMapping = true
      dexguardEnabled = false
      uploadNativeSymbols = shouldSentryAutoUpload()
      autoUploadNativeSymbols = shouldSentryAutoUpload()
      includeNativeSources = false
      includeSourceContext = shouldSentryAutoUpload()
      tracingInstrumentation {
          enabled = false
      }
      autoInstallation {
          enabled = false
      }
  }`);
  });

  it('warnOnce if modResults is missing in build.gradle', () => {
    (withProjectBuildGradle as jest.Mock).mockImplementation((config, callback) => {
      callback({});
    });

    withSentryAndroidGradlePlugin(mockConfig, {});

    expect(warnOnce).toHaveBeenCalledWith('android/build.gradle content is missing or undefined.');

    expect(withProjectBuildGradle).toHaveBeenCalled();
  });

  it('warnOnce if android/build.gradle is not Groovy', () => {
    (withProjectBuildGradle as jest.Mock).mockImplementation((config, callback) => {
      callback({ modResults: { language: 'kotlin', contents: mockedAppBuildGradle } });
    });

    withSentryAndroidGradlePlugin(mockConfig, {});

    expect(warnOnce).toHaveBeenCalledWith(
      'Cannot configure Sentry in android/build.gradle because it is not in Groovy.',
    );

    expect(withProjectBuildGradle).toHaveBeenCalled();
  });

  it('warnOnce if app/build.gradle is not Groovy', () => {
    (withAppBuildGradle as jest.Mock).mockImplementation((config, callback) => {
      callback({ modResults: { language: 'kotlin', contents: mockedAppBuildGradle } });
    });

    withSentryAndroidGradlePlugin(mockConfig, {});

    expect(warnOnce).toHaveBeenCalledWith(
      'Cannot configure Sentry in android/app/build.gradle because it is not in Groovy.',
    );

    expect(withAppBuildGradle).toHaveBeenCalled();
  });
});
