import * as React from 'react';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Import the Sentry React Native SDK
import * as Sentry from '@sentry/react-native';

import HomeScreen from './screens/HomeScreen';
import TrackerScreen from './screens/TrackerScreen';
import PerformanceTimingScreen from './screens/PerformanceTimingScreen';
import EndToEndTestsScreen from './screens/EndToEndTestsScreen';

import { store } from './reduxApp';
import { version as packageVersion } from '../../package.json';
import { SENTRY_INTERNAL_DSN } from './dsn';

Sentry.init({
  // Replace the example DSN below with your own DSN:
  dsn: SENTRY_INTERNAL_DSN,
  debug: true,
  beforeSend: (e) => {
    console.log('Event beforeSend:', e);
    return e;
  },
  maxBreadcrumbs: 150, // Extend from the default 100 breadcrumbs.
  enableAutoSessionTracking: true,
  // For testing, session close when 5 seconds (instead of the default 30) in the background.
  sessionTrackingIntervalMillis: 5000,
  // This will capture ALL TRACES and likely use up all your quota
  tracesSampleRate: 1.0,
  // Sets the `release` and `dist` on Sentry events. Make sure this matches EXACTLY with the values on your sourcemaps
  // otherwise they will not work.
  release: packageVersion,
  dist: `${packageVersion}.0`,
});

const Stack = createStackNavigator();

const App = () => {
  return (
    <Provider store={store}>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Tracker" component={TrackerScreen} />
          <Stack.Screen
            name="PerformanceTiming"
            component={PerformanceTimingScreen}
          />
          <Stack.Screen name="EndToEndTests" component={EndToEndTestsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </Provider>
  );
};

export default Sentry.withTouchEventBoundary(App, {
  ignoreNames: ['Provider', 'UselessName', /^SomeRegex/],
});
