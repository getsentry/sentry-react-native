import type { ExpoConfig } from '@expo/config-types';

import { warnOnce } from '../../plugin/src/utils';
import { modifyAppDelegate } from '../../plugin/src/withSentryIOS';

// Mock dependencies
jest.mock('@expo/config-plugins', () => ({
  ...jest.requireActual('@expo/config-plugins'),
  withAppDelegate: jest.fn((config, callback) => callback(config)),
}));

jest.mock('../../plugin/src/utils', () => ({
  warnOnce: jest.fn(),
}));

interface MockedExpoConfig extends ExpoConfig {
  modResults: {
    path: string;
    contents: string;
    language: 'swift' | 'objc';
  };
}

describe('modifyAppDelegate', () => {
  let config: MockedExpoConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to a mocked Swift config after each test
    config = {
      name: 'test',
      slug: 'test',
      modResults: {
        path: 'samples/react-native/ios/AppDelegate.swift',
        contents:
          'import UIKit\n\noverride func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {',
        language: 'swift',
      },
    };
  });

  it('should skip modification if modResults or path is missing', async () => {
    config.modResults.path = undefined;

    const result = await modifyAppDelegate(config);

    expect(warnOnce).toHaveBeenCalledWith('Skipping AppDelegate modification because the file does not exist.');
    expect(result).toBe(config); // No modification
  });

  it('should warn if RNSentrySDK.start() is already present in a Swift project', async () => {
    config.modResults.contents = 'RNSentrySDK.start();';

    const result = await modifyAppDelegate(config);

    expect(warnOnce).toHaveBeenCalledWith(`Your 'AppDelegate.swift' already contains 'RNSentrySDK.start()'.`);
    expect(result).toBe(config); // No modification
  });

  it('should warn if [RNSentrySDK start] is already present in an Objective-C project', async () => {
    config.modResults.language = 'objc';
    config.modResults.path = 'samples/react-native/ios/AppDelegate.mm';
    config.modResults.contents = '[RNSentrySDK start];';

    const result = await modifyAppDelegate(config);

    expect(warnOnce).toHaveBeenCalledWith(`Your 'AppDelegate.mm' already contains '[RNSentrySDK start]'.`);
    expect(result).toBe(config); // No modification
  });

  it('should modify a Swift file by adding the RNSentrySDK import and start', async () => {
    const result = (await modifyAppDelegate(config)) as MockedExpoConfig;

    expect(result.modResults.contents).toContain('import RNSentrySDK');
    expect(result.modResults.contents).toContain('RNSentrySDK.start()');
  });

  it('should modify an Objective-C file by adding the RNSentrySDK import and start', async () => {
    config.modResults.language = 'objc';
    config.modResults.contents =
      '#import "AppDelegate.h"\n\n- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {';

    const result = (await modifyAppDelegate(config)) as MockedExpoConfig;

    expect(result.modResults.contents).toContain('#import <RNSentry/RNSentry.h>');
    expect(result.modResults.contents).toContain('[RNSentrySDK start];');
  });

  it('should insert import statements only once in an Swift project', async () => {
    config.modResults.contents =
      'import UIKit\nimport RNSentrySDK\n\noverride func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {';

    const result = (await modifyAppDelegate(config)) as MockedExpoConfig;

    const importCount = (result.modResults.contents.match(/import RNSentrySDK/g) || []).length;
    expect(importCount).toBe(1);
  });

  it('should insert import statements only once in an Objective-C project', async () => {
    config.modResults.language = 'objc';
    config.modResults.contents =
      '#import "AppDelegate.h"\n#import <RNSentry/RNSentry.h>\n\n- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {';

    const result = (await modifyAppDelegate(config)) as MockedExpoConfig;

    const importCount = (result.modResults.contents.match(/#import <RNSentry\/RNSentry.h>/g) || []).length;
    expect(importCount).toBe(1);
  });
});
