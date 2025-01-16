import { withAppBuildGradle, withProjectBuildGradle } from '@expo/config-plugins';

import type { SentryAndroidGradlePluginOptions } from '../../plugin/src/withSentryAndroidGradlePlugin';
import { withSentryAndroidGradlePlugin } from '../../plugin/src/withSentryAndroidGradlePlugin';

jest.mock('@expo/config-plugins', () => ({
  withProjectBuildGradle: jest.fn(),
  withAppBuildGradle: jest.fn(),
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
        modResults: { contents: mockedBuildGradle },
      };
      const modified = callback(projectBuildGradle);
      return modified;
    });

    withSentryAndroidGradlePlugin(mockConfig, options);

    expect(withProjectBuildGradle).toHaveBeenCalled();
    expect(withProjectBuildGradle).toHaveBeenCalledWith(expect.any(Object), expect.any(Function));

    const calledCallback = (withProjectBuildGradle as jest.Mock).mock.calls[0][1];
    const modifiedGradle = calledCallback({
      modResults: { contents: mockedBuildGradle },
    });

    expect(modifiedGradle.modResults.contents).toContain(
      `classpath("io.sentry:sentry-android-gradle-plugin:${version}")`,
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

    // Mock withAppBuildGradle
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
      autoUploadProguardMapping = true
      includeProguardMapping = true
      dexguardEnabled = false
      uploadNativeSymbols = true
      autoUploadNativeSymbols = true
      includeNativeSources = false
      includeSourceContext = true
      tracingInstrumentation {
          enabled = false
      }
      autoInstallation {
          enabled = false
      }
  }`);
  });

  it('throws an error if modResults is missing in build.gradle', () => {
    (withProjectBuildGradle as jest.Mock).mockImplementation((config, callback) => {
      expect(() => callback({})).toThrow('android/build.gradle content is missing or undefined.');
    });

    withSentryAndroidGradlePlugin(mockConfig, {});

    expect(withProjectBuildGradle).toHaveBeenCalled();
  });

  it('throws an error if app/build.gradle is not Groovy', () => {
    (withAppBuildGradle as jest.Mock).mockImplementation((config, callback) => {
      expect(() => callback({ modResults: { language: 'kotlin', contents: mockedAppBuildGradle } })).toThrow(
        'Cannot configure Sentry in android/app/build.gradle because it is not in Groovy.',
      );
    });

    withSentryAndroidGradlePlugin(mockConfig, {});

    expect(withAppBuildGradle).toHaveBeenCalled();
  });
});
