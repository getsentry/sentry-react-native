import React, { useEffect } from 'react';
import {
  NavigationContainer,
  NavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

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
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import GesturesTracingScreen from './Screens/GesturesTracingScreen';
import { StyleSheet } from 'react-native';
import { HttpClient } from '@sentry/integrations';
import { timestampInSeconds } from '@sentry/utils';

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

// function simulateHeavySyncCalculation() {
//   let result = 0;
//   for (let i = 0; i < 1e7; i++) { // Adjusted for quicker demonstration
//     result += Math.sqrt(i) * Math.sin(i);
//   }
//   return result;
// }

// function performCalculationAsync() {
//   return new Promise((resolve) => {
//     setTimeout(() => {
//       const result = simulateHeavySyncCalculation();
//       resolve(result);
//     }, 0); // Keep this to ensure the function is asynchronous
//   });
// }

// // Function to delay execution for a given number of milliseconds
// function delay(ms) {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// async function runCalculationsAsync(times) {
//   for (let i = 0; i < times; i++) {
//     // Generate a random delay between 0.5 and 2 seconds
//     const randomDelay = Math.random() * (2000 - 500) + 500;

//     // Wait for the random delay before starting the next calculation
//     await delay(randomDelay);

//     // Then perform the calculation
//     const result = await performCalculationAsync();
//     console.log(`Calculation ${i + 1} completed with result: ${result}, after delay: ${randomDelay}ms`);
//   }
// }

// // Run the heavy calculation 50 times with random delays between each
// runCalculationsAsync(5000);


const Stack = createNativeStackNavigator();

const App = () => {
  const navigation = React.useRef<NavigationContainerRef<{}>>(null);

  useEffect(() => {
    navigation.current?.addListener('state', (e) => {
      console.log('state', e);
      // function simulateHeavySyncCalculation() {
      //   let result = 0;
      //   for (let i = 0; i < 1e7; i++) { // Reduced the workload for quicker demonstration
      //     result += Math.sqrt(i) * Math.sin(i);
      //   }
      //   return result;
      // }

      // function performCalculationAsync() {
      //   return new Promise((resolve) => {
      //     setTimeout(() => {
      //       const result = simulateHeavySyncCalculation();
      //       resolve(result);
      //     }, 0); // Timeout set to 0 to defer execution
      //   });
      // }

      // async function runCalculationsAsync(times: number) {
      //   for (let i = 0; i < times; i++) {
      //     performCalculationAsync().then((result) => {
      //       console.log(`Calculation ${i + 1} completed with result: ${result}`);
      //     });
      //   }
      // }

      // // Run the heavy calculation 50 times asynchronously
      // runCalculationsAsync(7);

    });
  }, [navigation]);

  return (
    <GestureHandlerRootView style={styles.wrapper}>
      <Provider store={store}>
        <NavigationContainer
          ref={navigation}
          onReady={() => {
            reactNavigationInstrumentation.registerNavigationContainer(
              navigation,
            );
          }}>
          <Stack.Navigator>
            <Stack.Screen name="Home" component={HomeScreen} listeners={{
              transitionEnd: (e) => {
                console.log('transitionEnd', timestampInSeconds() * 1000, e);
              }
            }}
            />
            <Stack.Screen name="Tracker" component={TrackerScreen} listeners={{
              transitionEnd: (e) => {
                console.log('transitionEnd', timestampInSeconds() * 1000, e);
              }
            }} />
            <Stack.Screen
              name="ManualTracker"
              component={ManualTrackerScreen}
              listeners={{
                transitionEnd: (e) => {
                  console.log('transitionEnd', e);
                },
              }}
            />
            <Stack.Screen
              name="PerformanceTiming"
              component={PerformanceTimingScreen}
            />
            <Stack.Screen name="Redux" component={ReduxScreen} />
            <Stack.Screen name="Gestures" component={GesturesTracingScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </Provider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
});

export default Sentry.wrap(App);
