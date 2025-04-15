import type { ExpoConfig } from '@expo/config-types';

import { warnOnce } from '../../plugin/src/utils';
import { modifyMainApplication } from '../../plugin/src/withSentryAndroid';

// Mock dependencies
jest.mock('@expo/config-plugins', () => ({
  ...jest.requireActual('@expo/config-plugins'),
  withMainApplication: jest.fn((config, callback) => callback(config)),
}));

jest.mock('../../plugin/src/utils', () => ({
  warnOnce: jest.fn(),
}));

interface MockedExpoConfig extends ExpoConfig {
  modResults: {
    path: string;
    contents: string;
    language: 'java' | 'kotlin';
  };
}

const kotlinContents = `package io.sentry.expo.sample

import android.app.Application

import com.facebook.react.ReactApplication
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }
}
`;

const kotlinExpected = `package io.sentry.expo.sample

import io.sentry.react.RNSentrySDK
import android.app.Application

import com.facebook.react.ReactApplication
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()

    RNSentrySDK.init(this)
    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }
}
`;

const javaContents = `package com.testappplain;

import android.app.Application;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.config.ReactFeatureFlags;
import com.facebook.soloader.SoLoader;

public class MainApplication extends Application implements ReactApplication {
  @Override
  public void onCreate() {
    super.onCreate();
    // If you opted-in for the New Architecture, we enable the TurboModule system
    ReactFeatureFlags.useTurboModules = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
    SoLoader.init(this, /* native exopackage */ false);
    initializeFlipper(this, getReactNativeHost().getReactInstanceManager());
  }
}
`;

const javaExpected = `package com.testappplain;

import io.sentry.react.RNSentrySDK;
import android.app.Application;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.config.ReactFeatureFlags;
import com.facebook.soloader.SoLoader;

public class MainApplication extends Application implements ReactApplication {
  @Override
  public void onCreate() {
    super.onCreate();

    RNSentrySDK.init(this);
    // If you opted-in for the New Architecture, we enable the TurboModule system
    ReactFeatureFlags.useTurboModules = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
    SoLoader.init(this, /* native exopackage */ false);
    initializeFlipper(this, getReactNativeHost().getReactInstanceManager());
  }
}
`;

describe('modifyMainApplication', () => {
  let config: MockedExpoConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to a mocked Java config after each test
    config = {
      name: 'test',
      slug: 'test',
      modResults: {
        path: '/android/app/src/main/java/com/example/MainApplication.java',
        contents: javaContents,
        language: 'java',
      },
    };
  });

  it('should skip modification if modResults or path is missing', async () => {
    config.modResults.path = undefined;

    const result = await modifyMainApplication(config);

    expect(warnOnce).toHaveBeenCalledWith(
      `Can't add 'RNSentrySDK.init' to Android MainApplication, because the file was not found.`,
    );
    expect(result).toBe(config); // No modification
  });

  it('should warn if RNSentrySDK.init is already present', async () => {
    config.modResults.contents = 'package com.example;\nsuper.onCreate();\nRNSentrySDK.init(this);';

    const result = await modifyMainApplication(config);

    expect(warnOnce).toHaveBeenCalledWith(
      `Your 'MainApplication.java' already contains 'RNSentrySDK.init', the native code won't be updated.`,
    );
    expect(result).toBe(config); // No modification
  });

  it('should modify a Java file by adding the RNSentrySDK import and init', async () => {
    const result = (await modifyMainApplication(config)) as MockedExpoConfig;

    expect(result.modResults.contents).toContain('import io.sentry.react.RNSentrySDK;');
    expect(result.modResults.contents).toContain('RNSentrySDK.init(this);');
    expect(result.modResults.contents).toBe(javaExpected);
  });

  it('should modify a Kotlin file by adding the RNSentrySDK import and init', async () => {
    config.modResults.language = 'kotlin';
    config.modResults.contents = kotlinContents;

    const result = (await modifyMainApplication(config)) as MockedExpoConfig;

    expect(result.modResults.contents).toContain('import io.sentry.react.RNSentrySDK');
    expect(result.modResults.contents).toContain('RNSentrySDK.init(this)');
    expect(result.modResults.contents).toBe(kotlinExpected);
  });

  it('should insert import statements only once', async () => {
    config.modResults.contents = 'package com.example;\nimport io.sentry.react.RNSentrySDK;\nsuper.onCreate();';

    const result = (await modifyMainApplication(config)) as MockedExpoConfig;

    const importCount = (result.modResults.contents.match(/import io.sentry.react.RNSentrySDK/g) || []).length;
    expect(importCount).toBe(1);
  });
});
