import React from 'react';
import {
  StatusBar,
  ScrollView,
  Button as NativeButton,
  View,
  ButtonProps,
  StyleSheet,
} from 'react-native';

import { StackNavigationProp } from '@react-navigation/stack';
import { CommonActions } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { Text } from 'react-native';
import { TimeToFullDisplay } from '../utils';
import { preloadArticles } from './SpaceflightNewsScreen';

interface Props {
  navigation: StackNavigationProp<any, 'PerformanceScreen'>;
}

const Spacer = () => <View style={styles.spacer} />;

const PerformanceScreen = (props: Props) => {
  const onPressPerformanceTiming = () => {
    // Navigate with a reset action just to test
    props.navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [
          { name: 'PerformanceScreen' },
          {
            name: 'PerformanceTiming',
            params: { someParam: 'hello' },
          },
        ],
      }),
    );
  };

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.mainView}>
        <TimeToFullDisplay record={true} />
        <Button
          title="Open Spaceflight News"
          onPress={() => {
            props.navigation.navigate('SpaceflightNewsScreen');
          }}
        />
        <Button
          title="Preload Spaceflight News"
          onPress={() => {
            console.log('Preloading SpaceflightNewsScreen');
            props.navigation.preload('SpaceflightNewsScreen');
            preloadArticles();
          }}
        />
        <Button
          title="Auto Tracing Example"
          onPress={() => {
            props.navigation.navigate('Tracker');
          }}
        />
        <Button
          title="Manual Tracing Example"
          onPress={() => {
            props.navigation.navigate('ManualTracker');
          }}
        />
        <Button
          title="Gestures Tracing Example"
          onPress={() => {
            props.navigation.navigate('Gestures');
          }}
        />
        <Button title="Performance Timing" onPress={onPressPerformanceTiming} />
        <Button
          title="Redux Example"
          onPress={() => {
            props.navigation.navigate('Redux');
          }}
        />
        <Spacer />
        <Text>
          Heavy Page Navigation that navigates back automatically, before
          finishing the time to display.
        </Text>
        <Button
          title="With Manual TimeToDisplay."
          onPress={() => {
            props.navigation.navigate('HeavyNavigation', { manualTrack: true });
          }}
        />
        <Button
          title="With Automatic TimeToDisplay."
          onPress={() => {
            props.navigation.navigate('HeavyNavigation');
          }}
        />
        <Spacer />
        <View style={styles.mainViewBottomWhiteSpace} />
      </ScrollView>
    </>
  );
};

const Button = (props: ButtonProps) => {
  return (
    <Sentry.Profiler name={`Button.${props.title.replace(' ', '_')}`}>
      <NativeButton {...props} color="#6C5FC7" />
      <View style={styles.buttonSpacer} />
    </Sentry.Profiler>
  );
};

const styles = StyleSheet.create({
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#362D59',
    marginBottom: 20,
  },
  buttonSpacer: {
    marginBottom: 8,
  },
  spacer: {
    height: 1,
    width: '100%',
    backgroundColor: '#c6becf',
    marginBottom: 16,
    marginTop: 8,
  },
  mainView: {
    padding: 20,
  },
  mainViewBottomWhiteSpace: {
    marginTop: 32,
  },
});

export default Sentry.withProfiler(PerformanceScreen);
