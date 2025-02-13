import React from 'react';
import {
  NavigationContainer,
  NavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// Import the Sentry React Native SDK
import * as Sentry from '@sentry/react-native';

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
import { LogBox, Platform, StyleSheet, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import PlaygroundScreen from './Screens/PlaygroundScreen';
import { logWithoutTracing, shouldUseAutoStart } from './utils';
import { ErrorEvent } from '@sentry/core';
import HeavyNavigationScreen from './Screens/HeavyNavigationScreen';
import WebviewScreen from './Screens/WebviewScreen';
import { isTurboModuleEnabled } from '@sentry/react-native/dist/js/utils/environment';

if (typeof setImmediate === 'undefined') {
  require('setimmediate');
}

LogBox.ignoreAllLogs();
const isMobileOs = Platform.OS === 'android' || Platform.OS === 'ios';

const reactNavigationIntegration = Sentry.reactNavigationIntegration({
  routeChangeTimeoutMs: 500, // How long it will wait for the route change to complete. Default is 1000ms
  enableTimeToInitialDisplay: isMobileOs,
  ignoreEmptyBackNavigationTransactions: true,
});

Sentry.init({
  beforeSend: (event: ErrorEvent) => {
    logWithoutTracing('Event beforeSend:', event.event_id);
    return event;
  },
  beforeSendTransaction(event) {
    logWithoutTracing('Transaction beforeSend:', event.event_id);
    return event;
  },
  // This will be called with a boolean `didCallNativeInit` when the native SDK has been contacted.
  onReady: ({ didCallNativeInit }) => {
    logWithoutTracing(
      'onReady called with didCallNativeInit:',
      didCallNativeInit,
    );
  },
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
      }),
      Sentry.appStartIntegration({
        standalone: false,
      }),
      Sentry.reactNativeErrorHandlersIntegration({
        patchGlobalPromise: Platform.OS === 'ios' && isTurboModuleEnabled()
          // The global patch doesn't work on iOS with the New Architecture in this Sample app
          // In
          ? false
          : true,
      }),
    );
    return integrations.filter(i => i.name !== 'Dedupe');
  },
  tracePropagationTargets: ['localhost', /^\//, /^https:\/\//, /^http:\/\//],
  autoInitializeNativeSdk: shouldUseAutoStart(),
});

const Stack = isMobileOs
  ? createNativeStackNavigator()
  : createStackNavigator();
const Tab = createBottomTabNavigator();

const ErrorsTabNavigator = Sentry.withProfiler(
  () => {
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
  },
  { name: 'ErrorsTab' },
);

const PerformanceTabNavigator = Sentry.withProfiler(
  () => {
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
            <Stack.Screen
              name="ManualTracker"
              component={ManualTrackerScreen}
            />
            <Stack.Screen
              name="HeavyNavigation"
              component={HeavyNavigationScreen}
            />
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
  },
  { name: 'PerformanceTab' },
);

function BottomTabsNavigator() {
  return (
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
        }}
        detachInactiveScreens={false} // workaround for https://github.com/react-navigation/react-navigation/issues/11384
      >
        <Tab.Screen
          name="ErrorsTab"
          component={ErrorsTabNavigator}
          options={{
            tabBarLabel: 'Errors',
            // eslint-disable-next-line react/no-unstable-nested-components
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
          component={PerformanceTabNavigator}
          options={{
            tabBarLabel: 'Performance',
            // eslint-disable-next-line react/no-unstable-nested-components
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? 'speedometer' : 'speedometer-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tab.Screen
          name="PlaygroundTab"
          component={PlaygroundScreen}
          options={{
            tabBarLabel: 'Playground',
            // eslint-disable-next-line react/no-unstable-nested-components
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={
                  focused ? 'american-football' : 'american-football-outline'
                }
                size={size}
                color={color}
              />
            ),
          }}
        />
      </Tab.Navigator>
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
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}>
        <Stack.Screen name="BottomTabs" component={BottomTabsNavigator} />
        <Stack.Screen name="Webview" component={WebviewScreen} options={{ headerShown: true }} />
      </Stack.Navigator>
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

function RunningIndicator() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return null;
  }

  return <RotatingBox />;
}

function RotatingBox() {
  const sv = useSharedValue<number>(0);

  React.useEffect(() => {
    sv.value = withRepeat(
      withTiming(360, {
        duration: 1_000_000,
        easing: Easing.linear,
      }),
      -1,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sv.value * 360}deg` }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.box, animatedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    position: 'absolute',
    left: 30,
    top: 30,
  },
  box: {
    height: 50,
    width: 50,
    backgroundColor: '#b58df1',
    borderRadius: 5,
  },
});

export default Sentry.wrap(App);
