/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * Generated with the TypeScript template
 * https://github.com/react-native-community/react-native-template-typescript
 *
 * @format
 */

import React, {type PropsWithChildren} from 'react';
import {
  Button,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import {
  Colors,
} from 'react-native/Libraries/NewAppScreen';

import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://d870ad989e7046a8b9715a57f59b23b5@o447951.ingest.sentry.io/5428561',
  debug: true,
  beforeSend: (event, hint) => {
    console.log('Event beforeSend:', event, 'hint:', hint);
    return event;
  },
  release: 'sampleNewArchitecture@1.0',
  dist: '1',
  integrations(integrations) {
    return integrations.filter((i) => i.name !== 'Dedupe');
  },
});

const Section: React.FC<
  PropsWithChildren<{
    title: string;
  }>
> = ({children, title}) => {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <View style={styles.sectionContainer}>
      <Text
        style={[
          styles.sectionTitle,
          {
            color: isDarkMode ? Colors.white : Colors.black,
          },
        ]}>
        {title}
      </Text>
      <Text
        style={[
          styles.sectionDescription,
          {
            color: isDarkMode ? Colors.light : Colors.dark,
          },
        ]}>
        {children}
      </Text>
    </View>
  );
};

const App = () => {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}
      />
      <View
        style={{
          padding: 20,
        }}>
        <Button title='Capture message' onPress={() => { Sentry.captureMessage('Test message') }} />
        <Button title='Throw an error' onPress={() => { throw new Error('JavaScript Error') }} />
        <Button title='Capture exception' onPress={() => { Sentry.captureException(new Error('Captured error')) }} />
        <Button title='Naive crash' onPress={() => { Sentry.nativeCrash() }} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  highlight: {
    fontWeight: '700',
  },
});

export default Sentry.wrap(App);
