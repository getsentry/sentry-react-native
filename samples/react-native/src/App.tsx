import React from 'react';
import {
  NavigationContainer,
  NavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Import the Sentry React Native SDK
import * as Sentry from '@sentry/react-native';

import { SENTRY_INTERNAL_DSN } from './dsn';
import ErrorsScreen from './Screens/ErrorsScreen';
import PerformanceScreen from './Screens/PerformanceScreen';
import TrackerScreen from './Screens/TrackerScreen';
import ManualTrackerScreen from './Screens/ManualTrackerScreen';
import PerformanceTimingScreen from './Screens/PerformanceTimingScreen';
import ReduxScreen from './Screens/ReduxScreen';
import { Provider } from 'react-redux';
import { store } from './reduxApp';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import GesturesTracingScreen from './Screens/GesturesTracingScreen';
import { StyleSheet } from 'react-native';
import { HttpClient } from '@sentry/integrations';
import Ionicons from 'react-native-vector-icons/Ionicons';

const reactNavigationInstrumentation =
  new Sentry.ReactNavigationInstrumentation({
    routeChangeTimeoutMs: 500, // How long it will wait for the route change to complete. Default is 1000ms
  });

Sentry.init({
  // Replace the example DSN below with your own DSN:
  dsn: SENTRY_INTERNAL_DSN,
  debug: true,
  environment: 'dev',
  beforeSend: (event: Sentry.Event) => {
    console.log('Event beforeSend:', event.event_id);
    return event;
  },
  beforeSendTransaction(event) {
    console.log('Transaction beforeSend:', event.event_id);
    return event;
  },
  // This will be called with a boolean `didCallNativeInit` when the native SDK has been contacted.
  onReady: ({ didCallNativeInit }) => {
    console.log('onReady called with didCallNativeInit:', didCallNativeInit);
  },
  integrations(integrations) {
    integrations.push(
      new Sentry.ReactNativeTracing({
        // The time to wait in ms until the transaction will be finished, For testing, default is 1000 ms
        idleTimeout: 5000,
        routingInstrumentation: reactNavigationInstrumentation,
        enableUserInteractionTracing: true,
        beforeNavigate: (context: Sentry.ReactNavigationTransactionContext) => {
          // Example of not sending a transaction for the screen with the name "Manual Tracker"
          if (context.data.route.name === 'ManualTracker') {
            context.sampled = false;
          }

          return context;
        },
      }),
      new HttpClient({
        // These options are effective only in JS.
        // This array can contain tuples of `[begin, end]` (both inclusive),
        // Single status codes, or a combinations of both.
        // default: [[500, 599]]
        failedRequestStatusCodes: [[400, 599]],
        // This array can contain Regexes or strings, or combinations of both.
        // default: [/.*/]
        failedRequestTargets: [/.*/],
      }),
      Sentry.metrics.metricsAggregatorIntegration(),
    );
    return integrations.filter(i => i.name !== 'Dedupe');
  },
  enableAutoSessionTracking: true,
  // For testing, session close when 5 seconds (instead of the default 30) in the background.
  sessionTrackingIntervalMillis: 5000,
  // This will capture ALL TRACES and likely use up all your quota
  enableTracing: true,
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
  _experiments: {
    profilesSampleRate: 1.0,
  },
  enableSpotlight: true,
});

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TabOneStack = Sentry.withProfiler(() => {
  return (
    <GestureHandlerRootView style={styles.wrapper}>
      <Provider store={store}>
        <Stack.Navigator>
          <Stack.Screen
            name="ErrorsScreen"
            component={ErrorsScreen}
            options={{ title: 'Errors' }}
          />
        </Stack.Navigator>
      </Provider>
    </GestureHandlerRootView>
  );
}, { name: 'ErrorsTab' });

const TabTwoStack = Sentry.withProfiler(() => {
  return (
    <GestureHandlerRootView style={styles.wrapper}>
      <Provider store={store}>
        <Stack.Navigator>
          <Stack.Screen
            name="PerformanceScreen"
            component={PerformanceScreen}
            options={{ title: 'Performance' }}
          />
          <Stack.Screen name="Tracker" component={TrackerScreen} />
          <Stack.Screen name="ManualTracker" component={ManualTrackerScreen} />
          <Stack.Screen
            name="PerformanceTiming"
            component={PerformanceTimingScreen}
          />
          <Stack.Screen name="Redux" component={ReduxScreen} />
          <Stack.Screen name="Gestures" component={GesturesTracingScreen} />
        </Stack.Navigator>
      </Provider>
    </GestureHandlerRootView>
  );
}, { name: 'PerformanceTab' });

function BottomTabs() {
  const navigation = React.useRef<NavigationContainerRef<{}>>(null);

  return (
    <NavigationContainer
      ref={navigation}
      onReady={() => {
        reactNavigationInstrumentation.registerNavigationContainer(navigation);
      }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
        }}
        detachInactiveScreens={false} // workaround for https://github.com/react-navigation/react-navigation/issues/11384
      >
        <Tab.Screen
          name="ErrorsTab"
          component={TabOneStack}
          options={{
            tabBarLabel: 'Errors',
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? 'bug' : 'bug-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tab.Screen
          name="PerformanceTab"
          component={TabTwoStack}
          options={{
            tabBarLabel: 'Performance',
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? 'speedometer' : 'speedometer-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
});

export default Sentry.wrap(BottomTabs);
