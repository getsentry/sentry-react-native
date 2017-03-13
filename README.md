
# react-native-sentry (alpha iOS only)

*Requirments:*

`react-native >= 0.41`

sentry-cli > 0.26: 

https://github.com/getsentry/sentry-cli

OR

`brew install getsentry/tools/sentry-cli`

Sentry can provide mixed stacktraces, which means if your app happens to crash on the native side you will also see the last call from javascript.

![Mixed Stacktrace](https://github.com/getsentry/react-native-sentry/raw/master/assets/mixed-stacktrace.png)

## Getting started

If you don't have a react native project up and running follow this guide.
https://facebook.github.io/react-native/docs/getting-started.html

Start with adding sentry:

`$ npm install react-native-sentry --save`

### Mostly automatic installation

`$ react-native link react-native-sentry`

### How to integrate it into your Xcode project

Open up your xcode project in the iOS folder, go to your project's target and
change the "Bundle React Native code and images" build script.  The script that
is currently there needs to be adjusted as follows:

```
export NODE_BINARY=node
sentry-cli react-native-xcode ../node_modules/react-native/packager/react-native-xcode.sh
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
  Sentry
} from 'react-native-sentry';

Sentry.config('Your DSN').install();
Sentry.activateStacktraceMerging(require('BatchedBridge'), require('parseErrorStack'));

export default class AwesomeProject extends Component {
...
```

Change `AppDelegate.m`

```objc
#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTRootView.h>
#import <React/RNSentry.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  NSURL *jsCodeLocation;

  jsCodeLocation = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index.ios" fallbackResource:nil];
  
  RCTRootView *rootView = [[RCTRootView alloc] initWithBundleURL:jsCodeLocation
                                                      moduleName:@"AwesomeProject"
                                               initialProperties:nil
                                                   launchOptions:launchOptions];
  
  [RNSentry installWithRootView:rootView]; // Install Sentry Exception Handler

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

## Documentation

These are functions you can call in your javascript code:

```js

import {
  Sentry,
  SentrySeverity,
  SentryLog
} from 'react-native-sentry';

Sentry.setLogLevel(SentryLog.Debug);

Sentry.setExtraContext({
  "a_thing": 3,
  "some_things": {"green": "red"},
  "foobar": ["a", "b", "c"],
  "react": true,
  "float": 2.43
});

Sentry.setTagsContext({
  "environment": "production",
  "react": true
});

Sentry.setUserContext({
  email: "john@apple.com",
  userID: "12341",
  username: "username",
  extra: {
    "is_admin": false
  }
});

Sentry.captureMessage("TEST message", {
  level: SentrySeverity.Warning
}); // Default SentrySeverity.Error

// This will trigger a crash in the native sentry client
//Sentry.nativeCrash();
```
