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
  SentryClient, 
  SentrySeverity, 
  SentryLog 
} from 'sentry-react-native';

SentryClient.setLogLevel(SentryLog.Debug);
SentryClient.shared = new SentryClient("Your DSN");

export default class ReactNativeExample extends Component {
  _throwError() {
    SentryClient.shared.captureMessage("TEST message", SentrySeverity.Warning);
    throw new Error('SentryClient: Test throw error');
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
