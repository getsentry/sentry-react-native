
# react-native-sentry (alpha iOS only)

*Requirments:*

`react-native >= 0.41`

sentry-cli > 0.25: 

https://github.com/getsentry/sentry-cli

OR

`brew install getsentry/tools/sentry-cli`

Sentry can provide mixed stacktraces, which means if your app happens to crash on the native side you will also see the last call from javascript.

![Mixed Stacktrace](assets/mixed-stacktrace.png?raw=1)

## Getting started

If you don't have a react native project up and running follow this guide.
https://facebook.github.io/react-native/docs/getting-started.html

Start with adding sentry:

`$ npm install react-native-sentry --save`

### Mostly automatic installation

`$ react-native link react-native-sentry`

### How to integrate it into you Xcode project

`react-native init AwesomeProject`

`cd AwesomeProject`

Add framework search paths:

`$(SRCROOT)/../node_modules/react-native-sentry/ios`
![Framework Search Paths](assets/framework-search-path.png?raw=1)

Always embed swift libraries:
![Always embed swift libraries](assets/embed-swift.png?raw=1)

Copy files phase:
![Copy files phase](assets/copy-files.png?raw=1)

Copy frameworks:
![Copy frameworks](assets/copy-frameworks.png?raw=1)

Add run script phase to upload your debug symbols and source maps:
![Run script](assets/run-script.png?raw=1)

Change this variables with your values: 
`SENTRY_ORG`
`SENTRY_PROJECT`
`SENTRY_AUTH_TOKEN`
```shell
if which sentry-cli >/dev/null; then
export SENTRY_ORG=YOUR-ORG
export SENTRY_PROJECT=YOUR-PROJECT
export SENTRY_AUTH_TOKEN=YOUR-AUTH-TOKEN
ERROR=$(sentry-cli upload-dsym 2>&1 >/dev/null)
if [ ! -z "$ERROR" ]; then
echo "warning: sentry-cli - $ERROR"
fi
RELEASE=$(/usr/libexec/PlistBuddy -c "print :CFBundleShortVersionString" $INFOPLIST_FILE)
BUILD=$(/usr/libexec/PlistBuddy -c "print :CFBundleVersion" $INFOPLIST_FILE)
../node_modules/react-native-sentry/bin/sourcemap_upload $RELEASE $BUILD
else
echo "warning: sentry-cli not installed, download from https://github.com/getsentry/sentry-cli/releases"
fi
```

Add sentry to your `index.ios.js`

```js
...
import {
  AppRegistry,
  StyleSheet,
  Text,
  View
} from 'react-native';

import {
  SentryClient,
  SentrySeverity,
  SentryLog,
  User
} from 'react-native-sentry';

SentryClient.setLogLevel(SentryLog.Debug);
SentryClient.shared = new SentryClient("Your DSN");
SentryClient.shared.activateStacktraceMerging(require('BatchedBridge'), require('parseErrorStack'));

export default class AwesomeProject extends Component {
...
```

Change `AppDelegate.m`

```objc
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTRootView.h>
#import <React/RNSentry.h>


@interface AppDelegate()

@property (nonatomic, strong) RNSentry *sentry;

@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  NSURL *jsCodeLocation;

  jsCodeLocation = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index.ios" fallbackResource:nil];

  self.sentry = [[RNSentry alloc] init];
  RCTBridge *bridge = [[RCTBridge alloc] initWithBundleURL:jsCodeLocation
                                            moduleProvider:^NSArray<id<RCTBridgeModule>> *{
                                              id<RCTExceptionsManagerDelegate> customDelegate = self.sentry;
                                              return @[[[RCTExceptionsManager alloc] initWithDelegate:customDelegate]];
                                            }
                                             launchOptions:launchOptions];
  
  RCTRootView *rootView = [[RCTRootView alloc] initWithBridge:bridge moduleName:@"AwesomeProject" initialProperties:nil];
  
  rootView.backgroundColor = [[UIColor alloc] initWithRed:1.0f green:1.0f blue:1.0f alpha:1];

  self.window = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
  UIViewController *rootViewController = [UIViewController new];
  rootViewController.view = rootView;
  self.window.rootViewController = rootViewController;
  [self.window makeKeyAndVisible];
  return YES;
}

@end
```
