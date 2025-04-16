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

const objcContents = `#import "AppDelegate.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"main";

  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

@end
`;

const objcExpected = `#import "AppDelegate.h"
#import <RNSentry/RNSentry.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  [RNSentrySDK start];
  self.moduleName = @"main";

  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

@end
`;

const swiftContents = `import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import UIKit

@main
class AppDelegate: RCTAppDelegate {
  override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    self.moduleName = "sentry-react-native-sample"
    self.dependencyProvider = RCTAppDependencyProvider()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}`;

const swiftExpected = `import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import UIKit
import RNSentry

@main
class AppDelegate: RCTAppDelegate {
  override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    RNSentrySDK.start()
    self.moduleName = "sentry-react-native-sample"
    self.dependencyProvider = RCTAppDependencyProvider()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}`;

describe('modifyAppDelegate', () => {
  let config: MockedExpoConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to a mocked Swift config after each test
    config = createMockConfig();
  });

  it('should skip modification if modResults or path is missing', async () => {
    config.modResults.path = undefined;

    const result = await modifyAppDelegate(config);

    expect(warnOnce).toHaveBeenCalledWith(
      `Can't add 'RNSentrySDK.start()' to the iOS AppDelegate, because the file was not found.`,
    );
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

    expect(result.modResults.contents).toContain('import RNSentry');
    expect(result.modResults.contents).toContain('RNSentrySDK.start()');
    expect(result.modResults.contents).toBe(swiftExpected);
  });

  it('should modify an Objective-C file by adding the RNSentrySDK import and start', async () => {
    config.modResults.language = 'objc';
    config.modResults.contents = objcContents;

    const result = (await modifyAppDelegate(config)) as MockedExpoConfig;

    expect(result.modResults.contents).toContain('#import <RNSentry/RNSentry.h>');
    expect(result.modResults.contents).toContain('[RNSentrySDK start];');
    expect(result.modResults.contents).toBe(objcExpected);
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

function createMockConfig(): MockedExpoConfig {
  return {
    name: 'test',
    slug: 'test',
    modResults: {
      path: 'samples/react-native/ios/AppDelegate.swift',
      contents: swiftContents,
      language: 'swift',
    },
  };
}
