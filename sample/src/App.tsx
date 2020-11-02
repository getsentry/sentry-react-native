import * as React from 'react';
import {View, Text} from 'react-native';
import {Provider} from 'react-redux';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';

// Import the Sentry React Native SDK
import * as Sentry from '@sentry/react-native';

import HomeScreen from './screens/HomeScreen';
import TrackerScreen from './screens/TrackerScreen';
import PerformanceTestScreen from './screens/PerformanceTestScreen';

import {store} from './reduxApp';

import {version as packageVersion} from '../../package.json';

Sentry.init({
  dsn:
    // Replace the example DSN below with your own DSN:
    'https://d870ad989e7046a8b9715a57f59b23b5@o447951.ingest.sentry.io/5428561',
  debug: true,
  beforeSend: (e) => {
    if (!e.tags) {
      e.tags = {};
    }
    e.tags.beforeSend = 'JS layer';

    console.log('Event beforeSend:', e);
    return e;
  },
  enableAutoSessionTracking: true,
  // For testing, session close when 5 seconds (instead of the default 30) in the background.
  sessionTrackingIntervalMillis: 5000,
  tracesSampleRate: 1.0,

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
            name="PerformanceTest"
            component={PerformanceTestScreen}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </Provider>
  );
};

export default Sentry.withTouchEventBoundary(App, {});
