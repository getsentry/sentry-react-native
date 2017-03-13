/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 * @flow
 */

import React, { Component } from 'react';

import {
  AppRegistry,
  StyleSheet,
  Text,
  View,
  Button
} from 'react-native';

import {
  Sentry,
  SentrySeverity,
  SentryLog
} from 'react-native-sentry';

Sentry.setLogLevel(SentryLog.Debug);
Sentry.config('Your DSN').install();
Sentry.activateStacktraceMerging(require('BatchedBridge'), require('parseErrorStack'));

Sentry.setExtraContext({
  "a_thing": 3,
  "some_things": {"green": "red"},
  "foobar": ["a", "b", "c"],
  "react": true,
  "float": 2.43
});

Sentry.setTagsContext({
  "environment": "production",
  "react": true
});

Sentry.setUserContext({
  email: "john@apple.com",
  userID: "12341",
  username: "username",
  extra: {
    "is_admin": false
  }
});

export default class ReactNativeExample extends Component {
  _sendMessage() {
    Sentry.captureMessage("TEST message", {
      level: SentrySeverity.Warning
    });
  }
  _throwError() {
    throw new Error('Sentry: Test throw error');
  }
  _nativeCrash() {
    Sentry.nativeCrash();
  }
  render() {
    return (
      <View style={styles.container}>
        <Text style={styles.welcome}>
          Welcome to React Native Sentry example
        </Text>
        <Button
          style={{fontSize: 20, color: 'green'}}
          styleDisabled={{color: 'red'}}
          onPress={() => this._throwError()}
          title="throw error!" />
        <Button
          style={{fontSize: 20, color: 'green'}}
          styleDisabled={{color: 'red'}}
          onPress={() => this._nativeCrash()}
          title="native crash!" />
        <Button
          style={{fontSize: 20, color: 'green'}}
          styleDisabled={{color: 'red'}}
          onPress={() => this._sendMessage()}
          title="send message" />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  welcome: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10,
  },
  instructions: {
    textAlign: 'center',
    color: '#333333',
    marginBottom: 5,
  },
});

AppRegistry.registerComponent('ReactNativeExample', () => ReactNativeExample);
