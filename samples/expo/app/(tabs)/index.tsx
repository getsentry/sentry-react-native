import { Button, ScrollView, StyleSheet } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { reloadAppAsync, isRunningInExpoGo } from 'expo';
import * as DevClient from 'expo-dev-client';
import { useRouter } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { setScopeProperties } from '@/utils/setScopeProperties';
import React from 'react';
import * as WebBrowser from 'expo-web-browser';
import { useUpdates } from 'expo-updates';
import { isWeb } from '../../utils/isWeb';

export default function TabOneScreen() {
  const { currentlyRunning } = useUpdates();
  const rawRouter = useRouter();
  // Wrap the router to monitor prefetch performance
  const router = Sentry.wrapExpoRouter(rawRouter);

  return (
    <ScrollView>
      <View style={styles.container}>
        <Sentry.TimeToInitialDisplay record />

        <Text>Welcome to Sentry Expo Sample App!</Text>
        <Text>Update ID: {currentlyRunning.updateId}</Text>
        <Text>Channel: {currentlyRunning.channel}</Text>
        <Text>Runtime Version: {currentlyRunning.runtimeVersion}</Text>

        <View style={styles.buttonWrapper}>
          <Button
            title="Open DevMenu"
            onPress={() => {
              DevClient.openMenu();
            }}
            disabled={isWeb()}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Prefetch Modal (Performance Tracked)"
            onPress={() => {
              // This prefetch call is automatically tracked by Sentry
              router.prefetch('/modal');
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Capture message"
            onPress={() => {
              Sentry.captureMessage('Captured message');
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Capture exception"
            onPress={() => {
              Sentry.captureException(new Error('Captured exception'));
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Capture exception with cause"
            onPress={() => {
              const error = new Error('Captured exception');
              error.cause = new Error('Cause of captured exception');
              Sentry.captureException(error);
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Uncaught Thrown Error"
            onPress={() => {
              throw new Error('Uncaught Thrown Error');
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Unhandled Promise Rejection"
            onPress={() => {
              // TODO: No working in Expo Go App
              Promise.reject(new Error('Unhandled Promise Rejection'));
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Native Crash"
            onPress={() => {
              if (isRunningInExpoGo()) {
                console.warn(
                  'Not supported in Expo Go. Build the application to test this feature.',
                );
                return;
              }
              Sentry.nativeCrash();
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Show feedback form"
            onPress={() => {
              Sentry.showFeedbackWidget();
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Show feedback button"
            onPress={() => {
              Sentry.showFeedbackButton();
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Set Scope Properties"
            onPress={() => {
              setScopeProperties();
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="console.warn()"
            onPress={() => {
              console.warn('This is a warning.');
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Send count metric"
            onPress={() => {
              Sentry.metrics.count('count_metric', 1);
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Send distribution metric"
            onPress={() => {
              Sentry.metrics.count('distribution_metric', 100);
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Send count metric with attributes"
            onPress={() => {
              Sentry.metrics.count('count_metric', 1, {
                attributes: { from_test_app: true },
              });
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Flush"
            onPress={async () => {
              await Sentry.flush();
              console.log('Sentry.flush() completed.');
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Close"
            onPress={async () => {
              await Sentry.close();
              console.log('Sentry.close() completed.');
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="Reload" onPress={() => reloadAppAsync()} />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Open WebBrowser"
            onPress={() => {
              WebBrowser.openBrowserAsync('https://sentry.io');
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Set different types of tags globally"
            onPress={async () => {
              Sentry.setTags({
                number: 123,
                boolean: true,
                null: null,
                undefined: undefined,
                symbol: Symbol('symbol'),
                string: 'string',
                bigint: BigInt(123),
              });
              Sentry.captureMessage(
                'Message with different types of tags globally',
              );
              Sentry.setTags({
                number: undefined,
                boolean: undefined,
                null: undefined,
                symbol: undefined,
                string: undefined,
                bigint: undefined,
              });
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Set different types of tags in scope"
            onPress={async () => {
              const evt = {
                message: 'Message with different types of tags isolated',
                tags: {
                  number: 123,
                  boolean: true,
                  null: null,
                  undefined: undefined,
                  symbol: Symbol('symbol'),
                  string: 'abc',
                  bigint: BigInt(123),
                },
              };
              Sentry.captureEvent(evt);
            }}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Sentry Logger"
            onPress={() => {
              Sentry.logger.info('expo info log');
              Sentry.logger.trace('expo trace log');
              Sentry.logger.debug('expo debug log');
              Sentry.logger.warn('expo warn log');
              Sentry.logger.error('expo error log');

              Sentry.logger.info('expo info log with data', {
                database: 'admin',
                number: 123,
                obj: { password: 'admin' },
              });
            }}
          />
        </View>
      </View>
    </ScrollView>
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
  buttonWrapper: {
    marginVertical: 6,
    marginHorizontal: 12,
    width: '80%',
  },
});
