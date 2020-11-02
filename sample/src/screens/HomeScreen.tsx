/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */

import React from 'react';
import {
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {StackNavigationProp} from '@react-navigation/stack';

import * as Sentry from '@sentry/react-native';

interface Props {
  navigation: StackNavigationProp<any, 'HomeScreen'>;
}

const HomeScreen = (props: Props) => {
  const currentDSN = Sentry.getCurrentHub().getClient().getOptions().dsn;
  const ourDSN =
    'https://d870ad989e7046a8b9715a57f59b23b5@o447951.ingest.sentry.io/5428561';

  // Show bad code inside error boundary to trigger it.
  const [showBadCode, setShowBadCode] = React.useState(false);

  const setScopeProps = () => {
    const dateString = new Date().toString();

    Sentry.setUser({
      id: 'test-id-0',
      email: 'testing@testing.test',
      username: 'USER-TEST',
      specialField: 'special user field',
      specialFieldNumber: 418,
    });

    Sentry.setTag('SINGLE-TAG', dateString);
    // @ts-ignore
    Sentry.setTag('SINGLE-TAG-NUMBER', 100);
    Sentry.setTags({
      'MULTI-TAG-0': dateString,
      'MULTI-TAG-1': dateString,
      'MULTI-TAG-2': dateString,
    });

    Sentry.setExtra('SINGLE-EXTRA', dateString);
    Sentry.setExtra('SINGLE-EXTRA-NUMBER', 100);
    Sentry.setExtra('SINGLE-EXTRA-OBJECT', {
      message: 'I am a teapot',
      status: 418,
      array: ['boo', 100, 400, {objectInsideArray: 'foobar'}],
    });
    Sentry.setExtras({
      'MULTI-EXTRA-0': dateString,
      'MULTI-EXTRA-1': dateString,
      'MULTI-EXTRA-2': dateString,
    });

    Sentry.setContext('TEST-CONTEXT', {
      stringTest: 'Hello',
      numberTest: 404,
      objectTest: {
        foo: 'bar',
      },
      arrayTest: ['foo', 'bar', 400],
      nullTest: null,
      undefinedTest: undefined,
    });

    Sentry.addBreadcrumb({
      level: Sentry.Severity.Info,
      message: `TEST-BREADCRUMB-INFO: ${dateString}`,
    });
    Sentry.addBreadcrumb({
      level: Sentry.Severity.Debug,
      message: `TEST-BREADCRUMB-DEBUG: ${dateString}`,
    });
    Sentry.addBreadcrumb({
      level: Sentry.Severity.Error,
      message: `TEST-BREADCRUMB-ERROR: ${dateString}`,
    });
    Sentry.addBreadcrumb({
      level: Sentry.Severity.Fatal,
      message: `TEST-BREADCRUMB-FATAL: ${dateString}`,
    });
    Sentry.addBreadcrumb({
      level: Sentry.Severity.Info,
      message: `TEST-BREADCRUMB-DATA: ${dateString}`,
      data: {
        stringTest: 'Hello',
        numberTest: 404,
        objectTest: {
          foo: 'bar',
        },
        arrayTest: ['foo', 'bar', 400],
        nullTest: null,
        undefinedTest: undefined,
      },
      category: 'TEST-CATEGORY',
    });

    console.log('Test scope properties were set.');
  };

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}>
        {
          // @ts-ignore
          global.HermesInternal == null ? null : (
            <View style={styles.engine}>
              <Text>Engine: Hermes</Text>
            </View>
          )
        }
        <View style={styles.body}>
          <Image
            source={require('../assets/sentry-logo.png')}
            style={styles.logo}
          />
          <Text style={styles.welcomeTitle}>Hey there!</Text>
          <Text style={styles.welcomeBody}>
            This is a simple sample app for you to try out the Sentry React
            Native SDK.
          </Text>
          {currentDSN === ourDSN && (
            <View style={styles.warningBlock}>
              <Text style={styles.warningText}>
                😃 Hey! You need to replace the DSN inside Sentry.init with your
                own or you won't see the events on your dashboard.
              </Text>
            </View>
          )}
          <View style={styles.buttonArea}>
            <TouchableOpacity
              onPress={() => {
                Sentry.captureMessage('Test Message');
              }}>
              <Text style={styles.buttonText}>Capture Message</Text>
            </TouchableOpacity>
            <View style={styles.spacer} />
            <TouchableOpacity
              onPress={() => {
                Sentry.captureException(new Error('Test Error'));
              }}>
              <Text style={styles.buttonText}>Capture Exception</Text>
            </TouchableOpacity>
            <View style={styles.spacer} />
            <TouchableOpacity
              onPress={() => {
                throw new Error('Thrown Error');
              }}>
              <Text style={styles.buttonText}>Uncaught Thrown Error</Text>
            </TouchableOpacity>
            <View style={styles.spacer} />
            <TouchableOpacity
              onPress={() => {
                Sentry.nativeCrash();
              }}>
              <Text style={styles.buttonText}>Native Crash</Text>
            </TouchableOpacity>
            <View style={styles.spacer} />
            <TouchableOpacity
              onPress={() => {
                setScopeProps();
              }}>
              <Text style={styles.buttonText}>Set Scope Properties</Text>
            </TouchableOpacity>
            <View style={styles.spacer} />
            <Sentry.ErrorBoundary
              fallback={({eventId}) => (
                <Text>Error boundary caught with event id: {eventId}</Text>
              )}>
              <TouchableOpacity
                onPress={() => {
                  setShowBadCode(true);
                }}>
                <Text style={styles.buttonText}>
                  Activate Error Boundary {showBadCode && <div />}
                </Text>
              </TouchableOpacity>
            </Sentry.ErrorBoundary>
          </View>
          <View style={styles.buttonArea}>
            <TouchableOpacity
              onPress={() => {
                props.navigation.navigate('Tracker');
              }}>
              <Text style={styles.buttonText}>Tracing Example</Text>
            </TouchableOpacity>
            <View style={styles.spacer} />
            <TouchableOpacity
              onPress={() => {
                props.navigation.navigate('PerformanceTest');
              }}>
              <Text style={styles.buttonText}>Performance Test</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    backgroundColor: '#fff',
    flex: 1,
  },
  engine: {
    position: 'absolute',
    right: 0,
  },
  logo: {
    width: 80,
    height: 80,
  },
  body: {
    backgroundColor: '#fff',
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#362D59',
  },
  welcomeBody: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
    color: '#362D59',
  },
  warningBlock: {
    marginTop: 12,
    backgroundColor: '#E1567C',
    padding: 8,
    borderRadius: 6,
  },
  warningText: {
    color: '#fff',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  buttonArea: {
    marginTop: 20,
    backgroundColor: '#F6F6F8',
    borderWidth: 1,
    borderColor: '#c6becf',
    borderRadius: 6,
  },
  buttonText: {
    color: '#3b6ecc',
    fontWeight: '700',
    fontSize: 16,
    padding: 14,
    textAlign: 'center',
  },
  spacer: {
    height: 1,
    width: '100%',
    backgroundColor: '#c6becf',
  },
});

export default HomeScreen;
