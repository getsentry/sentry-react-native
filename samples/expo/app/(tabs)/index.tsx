import { Button, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

import { Text, View } from '@/components/Themed';
import { setScopeProperties } from '@/utils/setScopeProperties';
import { timestampInSeconds } from '@sentry/utils';
import React from 'react';

const isRunningInExpoGo = Constants.appOwnership === 'expo'

export default function TabOneScreen() {
  const [componentMountStartTimestamp] = React.useState<number>(() => {
    return timestampInSeconds();
  });

  React.useEffect(() => {
    if (componentMountStartTimestamp) {
      // Distributions help you get the most insights from your data by allowing you to obtain aggregations such as p90, min, max, and avg.
      Sentry.metrics.distribution(
        'tab_one_mount_time',
        timestampInSeconds() - componentMountStartTimestamp,
        {
          unit: "seconds",
        },
      );
    }
    // We only want this to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <Sentry.TimeToInitialDisplay record />
      <Text>Welcome to Sentry Expo Sample App!</Text>
      <Button
        title="Capture message"
        onPress={() => {
          Sentry.captureMessage('Captured message');
        }}
      />
      <Button
        title="Capture exception"
        onPress={() => {
          Sentry.metrics.increment('tab_one.capture_exception_button_press', 1);
          Sentry.captureException(new Error('Captured exception'));
        }}
      />
      <Button
        title="Capture exception with cause"
        onPress={() => {
          const error = new Error('Captured exception')
          error.cause = new Error('Cause of captured exception')
          Sentry.captureException(error);
        }}
      />
      <Button
        title="Uncaught Thrown Error"
        onPress={() => {
          throw new Error('Uncaught Thrown Error');
        }}
      />
      <Button
        title="Unhandled Promise Rejection"
        onPress={() => {
          // TODO: No working in Expo Go App
          Promise.reject(new Error('Unhandled Promise Rejection'));
        }}
      />
      <Button
        title="Native Crash"
        onPress={() => {
          if (isRunningInExpoGo) {
            console.warn('Not supported in Expo Go. Build the application to test this feature.');
            return;
          }
          Sentry.nativeCrash();
        }}
      />
      <Button
        title="Set Scope Properties"
        onPress={() => {
          setScopeProperties();
        }}
      />
      <Button
        title="console.warn()"
        onPress={() => {
          console.warn('This is a warning.');
        }}
      />
      <Button
        title="Flush"
        onPress={async () => {
          await Sentry.flush();
          console.log('Sentry.flush() completed.');
        }}
      />
      <Button
        title="Close"
        onPress={async () => {
          await Sentry.close();
          console.log('Sentry.close() completed.');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
});
