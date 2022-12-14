import React from 'react';
import {
  NavigationContainer,
  NavigationContainerRef,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Import the Sentry React Native SDK
import * as Sentry from '@sentry/react-native';

import { SENTRY_INTERNAL_DSN } from './dsn';
import HomeScreen from './Screens/HomeScreen';
import TrackerScreen from './Screens/TrackerScreen';
import ManualTrackerScreen from './Screens/ManualTrackerScreen';
import PerformanceTimingScreen from './Screens/PerformanceTimingScreen';
import ReduxScreen from './Screens/ReduxScreen';
import { Provider } from 'react-redux';
import { store } from './reduxApp';

const reactNavigationInstrumentation =
  new Sentry.ReactNavigationInstrumentation({
    routeChangeTimeoutMs: 500, // How long it will wait for the route change to complete. Default is 1000ms
  });

Sentry.init({
  // Replace the example DSN below with your own DSN:
  dsn: SENTRY_INTERNAL_DSN,
  debug: true,
  beforeSend: (event, hint) => {
    console.log('Event beforeSend:', event, 'hint:', hint);
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
        tracingOrigins: ['localhost', /^\//, /^https:\/\//],
        beforeNavigate: (context: Sentry.ReactNavigationTransactionContext) => {
          // Example of not sending a transaction for the screen with the name "Manual Tracker"
          if (context.data.route.name === 'ManualTracker') {
            context.sampled = false;
          }

          return context;
        },
      }),
    );
    return integrations.filter(i => i.name !== 'Dedupe');
  },
  enableAutoSessionTracking: true,
  // For testing, session close when 5 seconds (instead of the default 30) in the background.
  sessionTrackingIntervalMillis: 5000,
  // This will capture ALL TRACES and likely use up all your quota
  tracesSampleRate: 1.0,
  attachStacktrace: true,
  // Sets the `release` and `dist` on Sentry events. Make sure this matches EXACTLY with the values on your sourcemaps
  // otherwise they will not work.
  // release: 'myapp@1.2.3+1',
  // dist: `1`,
});

const Stack = createStackNavigator();

const App = () => {
  const navigation = React.useRef<NavigationContainerRef<{}>>(null);

  return (
    <Provider store={store}>
      <NavigationContainer
        ref={navigation}
        onReady={() => {
          reactNavigationInstrumentation.registerNavigationContainer(
            navigation,
          );
        }}>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Tracker" component={TrackerScreen} />
          <Stack.Screen name="ManualTracker" component={ManualTrackerScreen} />
          <Stack.Screen
            name="PerformanceTiming"
            component={PerformanceTimingScreen}
          />
          <Stack.Screen name="Redux" component={ReduxScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </Provider>
  );
};

export default Sentry.wrap(App);
