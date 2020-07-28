/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */

import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  ScrollView,
  View,
  Text,
  StatusBar,
  TouchableOpacity,
} from 'react-native';

import {
  Header,
  LearnMoreLinks,
  Colors,
  DebugInstructions,
  ReloadInstructions,
} from 'react-native/Libraries/NewAppScreen';

import {Provider} from 'react-redux';
import * as Sentry from '@sentry/react-native';

import {version as packageVersion} from './package.json';

import {store} from './reduxApp';
import Counter from './Counter';

Sentry.init({
  dsn:
    // Replace the example DSN below with your own DSN:
    'https://6890c2f6677340daa4804f8194804ea2@o19635.ingest.sentry.io/148053',
  debug: true,
  beforeSend: (e) => {
    if (!e.tags) {
      e.tags = {};
    }
    e.tags['beforeSend'] = 'JS layer';

    console.log('Event beforeSend:', e);
    return e;
  },
  enableAutoSessionTracking: true,
  // For testing, session close when 5 seconds (instead of the default 30) in the background.
  sessionTrackingIntervalMillis: 5000,
});

const SetScopePropertiesButton = (props) => {
  return (
    <TouchableOpacity onPress={props.setScopeProps}>
      <Text style={styles.sectionTitle}>Set Scope Properties</Text>
    </TouchableOpacity>
  );
};

SetScopePropertiesButton.displayName = 'SetScopeProperties';

const App = () => {
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
    Sentry.setTag('SINGLE-TAG-NUMBER', 100);
    Sentry.setTags({
      'MULTI-TAG-0': dateString,
      'MULTI-TAG-1': dateString,
      'MULTI-TAG-2': dateString,
    });

    Sentry.setRelease(packageVersion);
    Sentry.setDist(`${packageVersion}.0`);

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
      level: 'info',
      message: `TEST-BREADCRUMB-INFO: ${dateString}`,
    });
    Sentry.addBreadcrumb({
      level: 'debug',
      message: `TEST-BREADCRUMB-DEBUG: ${dateString}`,
    });
    Sentry.addBreadcrumb({
      level: 'error',
      message: `TEST-BREADCRUMB-ERROR: ${dateString}`,
    });
    Sentry.addBreadcrumb({
      level: 'fatal',
      message: `TEST-BREADCRUMB-FATAL: ${dateString}`,
    });
    Sentry.addBreadcrumb({
      level: 'info',
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

  const clearBreadcrumbs = () => {
    Sentry.configureScope((scope) => {
      scope.clearBreadcrumbs();
    });
  };

  return (
    <Provider store={store}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView>
        <ScrollView
          accessibilityLabel="ScrollView"
          contentInsetAdjustmentBehavior="automatic"
          style={styles.scrollView}>
          <Header />
          {global.HermesInternal == null ? null : (
            <View style={styles.engine}>
              <Text style={styles.footer}>Engine: Hermes</Text>
            </View>
          )}
          <View style={styles.body}>
            <View style={styles.sectionContainer}>
              <Text
                style={styles.sectionTitle}
                onPress={() => {
                  Sentry.captureMessage('React Native Test Message');
                }}>
                captureMessage
              </Text>
              <Text
                style={styles.sectionTitle}
                onPress={() => {
                  Sentry.captureException(new Error('captureException test'));
                }}>
                captureException
              </Text>
              <Text
                style={styles.sectionTitle}
                onPress={() => {
                  throw new Error('throw new error test');
                }}>
                throw new Error
              </Text>
              <Text
                style={styles.sectionTitle}
                onPress={() => {
                  Sentry.nativeCrash();
                }}>
                nativeCrash
              </Text>
              <SetScopePropertiesButton setScopeProps={setScopeProps} />
              <Text onPress={clearBreadcrumbs} style={styles.sectionTitle}>
                Clear Breadcrumbs
              </Text>
              <Sentry.ErrorBoundary
                fallback={({eventId}) => (
                  <Text>Error boundary caught with event id: {eventId}</Text>
                )}>
                <TouchableOpacity
                  onPress={() => {
                    setShowBadCode(true);
                  }}>
                  <Text style={styles.sectionTitle}>
                    Activate Error Boundary {showBadCode && <div></div>}
                  </Text>
                </TouchableOpacity>
              </Sentry.ErrorBoundary>
              <Counter />
              <Text style={styles.sectionTitle}>Step One</Text>
              <Text style={styles.sectionDescription}>
                Edit <Text style={styles.highlight}>App.js</Text> to change this
                screen and then come back to see your edits.
              </Text>
            </View>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>See Your Changes</Text>
              <Text style={styles.sectionDescription}>
                <ReloadInstructions />
              </Text>
            </View>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Debug</Text>
              <Text style={styles.sectionDescription}>
                <DebugInstructions />
              </Text>
            </View>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Learn More</Text>
              <Text style={styles.sectionDescription}>
                Read the docs to discover what to do next:
              </Text>
            </View>
            <LearnMoreLinks />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Provider>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    backgroundColor: Colors.lighter,
  },
  engine: {
    position: 'absolute',
    right: 0,
  },
  body: {
    backgroundColor: Colors.white,
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.black,
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
    color: Colors.dark,
  },
  highlight: {
    fontWeight: '700',
  },
  footer: {
    color: Colors.dark,
    fontSize: 12,
    fontWeight: '600',
    padding: 4,
    paddingRight: 12,
    textAlign: 'right',
  },
});

export default Sentry.withTouchEventBoundary(App);
