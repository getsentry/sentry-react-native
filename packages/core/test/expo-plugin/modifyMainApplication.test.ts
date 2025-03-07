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
        contents: 'package com.example;\nsuper.onCreate();',
        language: 'java',
      },
    };
  });

  it('should skip modification if modResults or path is missing', async () => {
    config.modResults.path = undefined;

    const result = await modifyMainApplication(config);

    expect(warnOnce).toHaveBeenCalledWith('Skipping MainApplication modification because the file does not exist.');
    expect(result).toBe(config); // No modification
  });

  it('should warn if RNSentrySDK.init is already present', async () => {
    config.modResults.contents = 'package com.example;\nsuper.onCreate();\nRNSentrySDK.init(this);';

    const result = await modifyMainApplication(config);

    expect(warnOnce).toHaveBeenCalledWith(`Your 'MainApplication.java' already contains 'RNSentrySDK.init'.`);
    expect(result).toBe(config); // No modification
  });

  it('should modify a Java file by adding the RNSentrySDK import and init', async () => {
    const result = (await modifyMainApplication(config)) as MockedExpoConfig;

    expect(result.modResults.contents).toContain('import io.sentry.react.RNSentrySDK;');
    expect(result.modResults.contents).toContain('super.onCreate();\nRNSentrySDK.init(this);');
  });

  it('should modify a Kotlin file by adding the RNSentrySDK import and init', async () => {
    config.modResults.language = 'kotlin';
    config.modResults.contents = 'package com.example\nsuper.onCreate()';

    const result = (await modifyMainApplication(config)) as MockedExpoConfig;

    expect(result.modResults.contents).toContain('import io.sentry.react.RNSentrySDK');
    expect(result.modResults.contents).toContain('super.onCreate()\nRNSentrySDK.init(this)');
  });

  it('should insert import statements only once', async () => {
    config.modResults.contents = 'package com.example;\nimport io.sentry.react.RNSentrySDK;\nsuper.onCreate();';

    const result = (await modifyMainApplication(config)) as MockedExpoConfig;

    const importCount = (result.modResults.contents.match(/import io.sentry.react.RNSentrySDK/g) || []).length;
    expect(importCount).toBe(1);
  });
});
