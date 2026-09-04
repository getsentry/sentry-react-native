/**
 * Sentry React Native visionOS Sample
 *
 * @format
 */

import React from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as Sentry from '@sentry/react-native';

import { SENTRY_INTERNAL_DSN } from './dsn';

Sentry.init({
  dsn: SENTRY_INTERNAL_DSN,
  // Sets the sample rate to 1.0 to capture 100% of transactions for tracing.
  tracesSampleRate: 1.0,
  // Adds more context data to events (IP address, cookies, user, etc.).
  // Only enabled here for the sample app - gate on user consent in production.
  // https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,
});

function App(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={styles.body}>
          <Text style={styles.title}>Sentry React Native visionOS</Text>
          <Button
            title="Capture message"
            onPress={() => {
              Sentry.captureMessage('Hello from the visionOS sample!');
            }}
          />
          <View style={styles.spacer} />
          <Button
            title="Capture exception"
            onPress={() => {
              Sentry.captureException(
                new Error('First error from the visionOS sample!'),
              );
            }}
          />
          <View style={styles.spacer} />
          <Button
            title="Throw unhandled error"
            onPress={() => {
              throw new Error('Unhandled error from the visionOS sample!');
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 24,
  },
  spacer: {
    height: 12,
  },
});

export default Sentry.wrap(App);
