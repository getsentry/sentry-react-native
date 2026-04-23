import React from 'react';
import {
  Button as NativeButton,
  ButtonProps,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as Sentry from '@sentry/react-native';

/**
 * Demonstrates `Sentry.GlobalErrorBoundary` — the boundary that catches
 * fatal JS errors thrown *outside* the React render phase (event handlers,
 * timers, unhandled promise rejections) and renders a fallback UI.
 *
 * In release builds the fallback replaces React Native's default red-box
 * handler for fatals. In dev, LogBox still appears — the fallback renders
 * alongside it so you can see both.
 */
const GlobalErrorBoundaryScreen: React.FC = () => {
  return (
    <Sentry.GlobalErrorBoundary
      // Opt in to rejection fallback so the "Unhandled Promise Rejection"
      // button also swaps the screen for the fallback UI.
      includeUnhandledRejections
      fallback={({ error, eventId, resetError }) => (
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>Something went wrong.</Text>
          <Text style={styles.fallbackBody}>
            {(error as Error)?.message ?? String(error)}
          </Text>
          {eventId ? (
            <Text style={styles.fallbackMeta}>Event: {eventId}</Text>
          ) : null}
          <View style={styles.fallbackButton}>
            <NativeButton title="Reset" onPress={resetError} color="#6C5FC7" />
          </View>
        </View>
      )}
      onError={(error, _componentStack, eventId) => {
        // eslint-disable-next-line no-console
        console.log(
          '[GlobalErrorBoundary] caught',
          (error as Error)?.message,
          'eventId=',
          eventId,
        );
      }}>
      <Playground />
    </Sentry.GlobalErrorBoundary>
  );
};

const Playground: React.FC = () => {
  return (
    <>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.main}>
        <Text style={styles.heading}>Sentry.GlobalErrorBoundary</Text>
        <Text style={styles.description}>
          Each button triggers a fatal JS error from a context that a regular
          React error boundary cannot catch. The fallback above replaces this
          content until you press Reset.
        </Text>

        <Button
          title="Throw from event handler"
          onPress={() => {
            throw new Error(
              'GlobalErrorBoundary: thrown synchronously from onPress',
            );
          }}
        />

        <Button
          title="Throw from setTimeout"
          onPress={() => {
            setTimeout(() => {
              throw new Error('GlobalErrorBoundary: thrown from setTimeout');
            }, 0);
          }}
        />

        <Button
          title="Unhandled promise rejection"
          onPress={() => {
            // Intentionally not awaited and not caught.
            void Promise.reject(
              new Error('GlobalErrorBoundary: unhandled promise rejection'),
            );
          }}
        />

        <View style={styles.footer} />
      </ScrollView>
    </>
  );
};

const Button: React.FC<ButtonProps> = props => (
  <>
    <NativeButton {...props} color="#6C5FC7" />
    <View style={styles.buttonSpacer} />
  </>
);

const styles = StyleSheet.create({
  main: {
    padding: 20,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: '#362D59',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#4A4556',
    marginBottom: 20,
  },
  buttonSpacer: {
    marginBottom: 8,
  },
  footer: {
    marginTop: 32,
  },
  fallback: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#FFF5F5',
  },
  fallbackTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#6C1A1A',
    marginBottom: 12,
  },
  fallbackBody: {
    fontSize: 14,
    color: '#6C1A1A',
    marginBottom: 12,
  },
  fallbackMeta: {
    fontSize: 12,
    color: '#8B5A5A',
    marginBottom: 24,
  },
  fallbackButton: {
    alignSelf: 'flex-start',
  },
});

export default GlobalErrorBoundaryScreen;
