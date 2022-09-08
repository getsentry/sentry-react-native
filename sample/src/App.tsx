import * as React from 'react';
import {Provider} from 'react-redux';
import {
  NavigationContainer,
  NavigationContainerRef,
} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';

// Import the Sentry React Native SDK
import * as Sentry from '@sentry/react-native';

import HomeScreen from './screens/HomeScreen';
import TrackerScreen from './screens/TrackerScreen';
import ManualTrackerScreen from './screens/ManualTrackerScreen';
import PerformanceTimingScreen from './screens/PerformanceTimingScreen';
import EndToEndTestsScreen from './screens/EndToEndTestsScreen';
import ReduxScreen from './screens/ReduxScreen';

import {store} from './reduxApp';
import {SENTRY_INTERNAL_DSN} from './dsn';

const reactNavigationInstrumentation =
  new Sentry.ReactNavigationInstrumentation({
    routeChangeTimeoutMs: 500, // How long it will wait for the route change to complete. Default is 1000ms
  });
Sentry.init({
  // Replace the example DSN below with your own DSN:
  dsn: SENTRY_INTERNAL_DSN,
  debug: true,
  beforeSend: (e, hint) => {
    console.log('Event beforeSend:', e, 'hint:', hint);
    return e;
  },
  // This will be called with a boolean `didCallNativeInit` when the native SDK has been contacted.
  onReady: ({didCallNativeInit}) => {
    console.log('onReady called with didCallNativeInit:', didCallNativeInit);
  },
  maxCacheItems: 40, // Extend from the default 30.
  integrations: [
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
  ],
  enableAutoSessionTracking: true,
  // For testing, session close when 5 seconds (instead of the default 30) in the background.
  sessionTrackingIntervalMillis: 5000,
  // This will capture ALL TRACES and likely use up all your quota
  tracesSampleRate: 1.0,
  // Sets the `release` and `dist` on Sentry events. Make sure this matches EXACTLY with the values on your sourcemaps
  // otherwise they will not work.
  // release: 'myapp@1.2.3+1',
  // dist: `1`,
  attachStacktrace: true,
});

const Stack = createStackNavigator();

const App = () => {
  const navigation = React.useRef<NavigationContainerRef>();

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
          <Stack.Screen name="EndToEndTests" component={EndToEndTestsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </Provider>
  );
};

// Wrap your app to get more features out of the box such as auto performance monitoring.
export default Sentry.wrap(App);
