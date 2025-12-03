import React from 'react';

import { Ionicons } from '@react-native-vector-icons/ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  NavigationContainer,
  NavigationContainerRef,
  TypedNavigator,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createStackNavigator } from '@react-navigation/stack';
import * as Sentry from '@sentry/react-native';
import { isTurboModuleEnabled } from '@sentry/react-native/dist/js/utils/environment';
import { LogBox, Platform } from 'react-native';
import * as ImagePicker from 'react-native-image-picker';

import RunningIndicator from './components/RunningIndicator';
import WebviewScreen from './Screens/WebviewScreen';
import getErrorsTab from './tabs/ErrorsTab';
import getPerformanceTab from './tabs/PerformanceTab';
import getPlaygroundTab from './tabs/PlaygroundTab';
import { getDsn, logWithoutTracing } from './utils';

LogBox.ignoreAllLogs();
const isMobileOs = Platform.OS === 'android' || Platform.OS === 'ios';

if (typeof setImmediate === 'undefined') {
  require('setimmediate');
}

const reactNavigationIntegration = Sentry.reactNavigationIntegration({
  routeChangeTimeoutMs: 500, // How long it will wait for the route change to complete. Default is 1000ms
  enableTimeToInitialDisplay: isMobileOs,
  ignoreEmptyBackNavigationTransactions: false,
  enableTimeToInitialDisplayForPreloadedRoutes: true,
  useDispatchedActionData: true,
});

const sampleFeatureFlagsIntegration = Sentry.featureFlagsIntegration();
sampleFeatureFlagsIntegration.addFeatureFlag('sample-test-flag', true);

const StackNavigator: TypedNavigator<any, any> = isMobileOs
  ? createNativeStackNavigator()
  : createStackNavigator();
const BottomTabNavigator = createBottomTabNavigator();

Sentry.init({
  // Replace the example DSN below with your own DSN:
  dsn: getDsn(),
  debug: true,
  environment: 'dev',
  beforeSend: (event: Sentry.ErrorEvent) => {
    logWithoutTracing('Event beforeSend:', event.event_id);
    return event;
  },
  beforeSendTransaction(event: Sentry.TransactionEvent) {
    logWithoutTracing('Transaction beforeSend:', event.event_id);
    return event;
  },
  beforeSendMetric(metric: Sentry.Metric) {
    logWithoutTracing('Metric beforeSend:', metric.name, metric.value);
    return metric;
  },
  // This will be called with a boolean `didCallNativeInit` when the native SDK has been contacted.
  onReady: ({ didCallNativeInit }) => {
    logWithoutTracing(
      'onReady called with didCallNativeInit:',
      didCallNativeInit,
    );
  },
  _experiments: {
    enableUnhandledCPPExceptionsV2: true,
  },
  logsOrigin: 'all',
  enableLogs: true,
  beforeSendLog: (log) => {
    return log;
  },
  enableUserInteractionTracing: true,
  integrations(integrations) {
    integrations.push(
      reactNavigationIntegration,
      Sentry.reactNativeTracingIntegration({
        // The time to wait in ms until the transaction will be finished, For testing, default is 1000 ms
        idleTimeoutMs: 5_000,
      }),
      Sentry.httpClientIntegration({
        // These options are effective only in JS.
        // This array can contain tuples of `[begin, end]` (both inclusive),
        // Single status codes, or a combinations of both.
        // default: [[500, 599]]
        failedRequestStatusCodes: [[400, 599]],
        // This array can contain Regexes or strings, or combinations of both.
        // default: [/.*/]
        failedRequestTargets: [/.*/],
      }),
      Sentry.mobileReplayIntegration({
        maskAllImages: true,
        maskAllVectors: true,
        maskAllText: true,
        enableViewRendererV2: true,
        screenshotStrategy: 'canvas', // if you have strict PII requirements
      }),
      Sentry.appStartIntegration({
        standalone: false,
      }),
      Sentry.reactNativeErrorHandlersIntegration({
        patchGlobalPromise:
          Platform.OS === 'ios' && isTurboModuleEnabled()
            ? // The global patch doesn't work on iOS with the New Architecture in this Sample app
              // In
            false
            : true,
      }),
      Sentry.feedbackIntegration({
        imagePicker: ImagePicker,
        enableScreenshot: true,
        enableTakeScreenshot: true,
        styles: {
          submitButton: {
            backgroundColor: '#6a1b9a',
            paddingVertical: 15,
            borderRadius: 5,
            alignItems: 'center',
            marginBottom: 10,
          },
        },
        namePlaceholder: 'Fullname',
        buttonOptions: {
          styles: {
            triggerButton: {
              marginBottom: 75, // Place above the tab bar
            },
          },
        },
        screenshotButtonOptions: {
          styles: {
            triggerButton: {
              marginBottom: 75, // Place above the tab bar
            },
          },
        },
      }),
      Sentry.extraErrorDataIntegration(),
      sampleFeatureFlagsIntegration,
    );
    return integrations.filter(i => i.name !== 'Dedupe');
  },
  enableAutoSessionTracking: true,
  // For testing, session close when 5 seconds (instead of the default 30) in the background.
  sessionTrackingIntervalMillis: 30000,
  tracesSampleRate: 1.0,
  tracePropagationTargets: ['localhost', /^\//, /^https:\/\//, /^http:\/\//],
  attachStacktrace: true,
  // Attach screenshots to events.
  attachScreenshot: true,
  // Attach view hierarchy to events.
  attachViewHierarchy: true,
  // Enables capture failed requests in JS and native.
  enableCaptureFailedRequests: true,
  // Sets the `release` and `dist` on Sentry events. Make sure this matches EXACTLY with the values on your sourcemaps
  // otherwise they will not work.
  // release: 'myapp@1.2.3+1',
  // dist: `1`,
  profilesSampleRate: 1.0,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  ignoreErrors: ['should', /(.)*2(.)*/],
  replaysSessionQuality: 'medium', // default
  spotlight: false,
  // This should be disabled when manually initializing the native SDK
  // Note that options from JS are not passed to the native SDKs when initialized manually
  autoInitializeNativeSdk: true,
  enableMetrics: true,
});

function BottomTabsNavigator() {
  return (
    <BottomTabNavigator.Navigator
      screenOptions={{
        headerShown: false,
      }}
      detachInactiveScreens={false}>
      <BottomTabNavigator.Screen
        name="ErrorsTab"
        component={getErrorsTab(StackNavigator)}
        options={{
          tabBarLabel: 'Errors',
          // eslint-disable-next-line react/no-unstable-nested-components
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'bug' : 'bug-outline'}
              size={size}
              color={color}
              testID="errors-tab-icon"
            />
          ),
        }}
      />
      <BottomTabNavigator.Screen
        name="PerformanceTab"
        component={getPerformanceTab(StackNavigator)}
        options={{
          tabBarLabel: 'Performance',
          // eslint-disable-next-line react/no-unstable-nested-components
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'speedometer' : 'speedometer-outline'}
              size={size}
              color={color}
              testID="performance-tab-icon"
            />
          ),
        }}
      />
      <BottomTabNavigator.Screen
        name="PlaygroundTab"
        component={getPlaygroundTab()}
        options={{
          tabBarLabel: 'Playground',
          // eslint-disable-next-line react/no-unstable-nested-components
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'american-football' : 'american-football-outline'}
              size={size}
              color={color}
              testID="playground-tab-icon"
            />
          ),
        }}
      />
    </BottomTabNavigator.Navigator>
  );
}

function RootNavigationContainer() {
  const navigation = React.useRef<NavigationContainerRef<{}>>(null);

  return (
    <NavigationContainer
      ref={navigation}
      onReady={() => {
        reactNavigationIntegration.registerNavigationContainer(navigation);
      }}>
      <StackNavigator.Navigator
        screenOptions={{
          headerShown: false,
        }}>
        <StackNavigator.Screen
          name="BottomTabs"
          component={BottomTabsNavigator}
        />
        <StackNavigator.Screen
          name="Webview"
          component={WebviewScreen}
          options={{ headerShown: true }}
        />
      </StackNavigator.Navigator>
    </NavigationContainer>
  );
}

function App() {
  return (
    <>
      <RootNavigationContainer />
      <RunningIndicator />
    </>
  );
}

export default Sentry.wrap(App);
