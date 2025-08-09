import React from 'react';
import { StyleSheet } from 'react-native';

import { TypedNavigator } from '@react-navigation/core';
import * as Sentry from '@sentry/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider } from 'react-redux';

import GesturesTracingScreen from '../screens/GesturesTracingScreen';
import HeavyNavigationScreen from '../screens/HeavyNavigationScreen';
import ManualTrackerScreen from '../screens/ManualTrackerScreen';
import PerformanceScreen from '../screens/PerformanceScreen';
import PerformanceTimingScreen from '../screens/PerformanceTimingScreen';
import ReduxScreen from '../screens/ReduxScreen';
import SpaceflightNewsScreen from '../screens/SpaceflightNewsScreen';
import TrackerScreen from '../screens/TrackerScreen';
import store from '../store';

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
});

export default function getPerformanceTab(Navigator: TypedNavigator<any, any>) {
  return Sentry.withProfiler(
    () => {
      return (
        <GestureHandlerRootView style={styles.wrapper}>
          <Provider store={store}>
            <Navigator.Navigator>
              <Navigator.Screen
                name="PerformanceScreen"
                component={PerformanceScreen}
                options={{ title: 'Performance' }}
              />
              <Navigator.Screen
                name="SpaceflightNewsScreen"
                component={SpaceflightNewsScreen}
              />
              <Navigator.Screen name="Tracker" component={TrackerScreen} />
              <Navigator.Screen
                name="ManualTracker"
                component={ManualTrackerScreen}
              />
              <Navigator.Screen
                name="HeavyNavigation"
                component={HeavyNavigationScreen}
              />
              <Navigator.Screen
                name="PerformanceTiming"
                component={PerformanceTimingScreen}
              />
              <Navigator.Screen name="Redux" component={ReduxScreen} />
              <Navigator.Screen
                name="Gestures"
                component={GesturesTracingScreen}
              />
            </Navigator.Navigator>
          </Provider>
        </GestureHandlerRootView>
      );
    },
    { name: 'PerformanceTab' },
  );
}
