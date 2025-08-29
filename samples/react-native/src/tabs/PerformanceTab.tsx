import React from 'react';
import { StyleSheet } from 'react-native';

import { TypedNavigator } from '@react-navigation/core';
import * as Sentry from '@sentry/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider } from 'react-redux';

import GesturesTracingScreen from '../Screens/GesturesTracingScreen';
import HeavyNavigationScreen from '../Screens/HeavyNavigationScreen';
import ManualTrackerScreen from '../Screens/ManualTrackerScreen';
import PerformanceScreen from '../Screens/PerformanceScreen';
import PerformanceTimingScreen from '../Screens/PerformanceTimingScreen';
import ReduxScreen from '../Screens/ReduxScreen';
import SpaceflightNewsScreen from '../Screens/SpaceflightNewsScreen';
import TrackerScreen from '../Screens/TrackerScreen';
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
