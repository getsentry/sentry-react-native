import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { Button, StyleSheet, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { HttpClient } from '@sentry/integrations';
import { SENTRY_INTERNAL_DSN } from './src/dsn';
import { setScopeProperties } from './src/setScopeProperties';
import React from 'react';

const isRunningInExpoGo = Constants.appOwnership === 'expo'

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
    profilesSampleRate: 0,
  },
});

function App() {
  return (
    <View style={styles.container}>
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
          Sentry.captureException(new Error('Captured exception'));
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
      <StatusBar style="auto" />
    </View>
  );
}

export default Sentry.wrap(App);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
