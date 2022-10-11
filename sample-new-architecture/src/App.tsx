import React from 'react';
import {
  NavigationContainer,
  NavigationContainerRef,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Import the Sentry React Native SDK
import * as Sentry from '@sentry/react-native';

import { SENTRY_INTERNAL_DSN } from './dsn';
import { HomeScreen } from './Screens/HomeScreen';

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
  onReady: ({didCallNativeInit}) => {
    console.log('onReady called with didCallNativeInit:', didCallNativeInit);
  },
  integrations(integrations) {
    return integrations.filter((i) => i.name !== 'Dedupe');
  },
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
    <NavigationContainer
      ref={navigation}
      onReady={() => {
        reactNavigationInstrumentation.registerNavigationContainer(
          navigation,
        );
      }}>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default Sentry.wrap(App);
