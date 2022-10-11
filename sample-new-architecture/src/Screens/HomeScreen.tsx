import React from 'react';
import {
  SafeAreaView,
  StatusBar,
  ScrollView,
  Text,
  Button as NativeButton,
  View,
  ButtonProps,
  StyleSheet
} from 'react-native';

import * as Sentry from '@sentry/react-native';

import { setScopeProperties } from '../setScopeProperties';

export const HomeScreen = () => {
  // Show bad code inside error boundary to trigger it.
  const [showBadCode, setShowBadCode] = React.useState(false);

  return (
    <SafeAreaView style={{ backgroundColor: '#F3F3F3' }}>
    <StatusBar barStyle='dark-content'/>
    <ScrollView
      style={{
        padding: 20,
      }}>
      <Text style={styles.welcomeTitle}>Hey there!</Text>
      <Button title='Capture message' onPress={() => { Sentry.captureMessage('Captured message') }} />
      <Button title='Capture exception' onPress={() => { Sentry.captureException(new Error('Captured exception')) }} />
      <Button title='Uncaught Thrown Error' onPress={() => { throw new Error('Uncaught Thrown Error') }} />
      <Button title='Unhandled Promise Rejection' onPress={() => { Promise.reject('Unhandled Promise Rejection') }} />
      <Button title='Native Crash' onPress={() => { Sentry.nativeCrash() }} />
      <Button title='Set Scope Properties' onPress={() => { setScopeProperties() }} />
      <Button title='Flush' onPress={async () => { await Sentry.flush(); console.log('Sentry.flush() completed.') }} />
      <Button title='Close' onPress={async () => { await Sentry.close(); console.log('Sentry.close() completed.') }} />

      <Spacer />

      <Sentry.ErrorBoundary
        fallback={({ eventId }) => (<Text>Error boundary caught with event id: {eventId}</Text>)}
      >
        <Button title='Activate Error Boundary' onPress={() => { setShowBadCode(true) }} />
        {showBadCode && <div />}
      </Sentry.ErrorBoundary>

      <Spacer />

      <Button title='Add attachment' onPress={() => {
        Sentry.configureScope((scope) => {
          scope.addAttachment({ data: 'Attachment content', filename: 'attachment.txt' });
        })
      }} />
      <Button title='Get attachments' onPress={async () => {
        Sentry.configureScope((scope) => {
          console.log('Attachments:', scope.getAttachments());
        })
      }} />
      <Button title='Auto Tracing Example' onPress={() => { console.log('TODO:') }} />
      <Button title='Manual Tracing Example' onPress={() => { console.log('TODO:') }} />
      <Button title='Performance Timing' onPress={() => { console.log('TODO:') }} />
      <Button title='Redux Example' onPress={() => { console.log('TODO:') }} />
      <View style={{marginTop: 32}} />
    </ScrollView>
  </SafeAreaView>
  )
};

const Button = (props: ButtonProps) => (<>
  <NativeButton
    {...props}
    color='#6C5FC7'
    />
    <View style={styles.buttonSpacer} />
</>);

const Spacer = () => <View style={styles.spacer} />;

const styles = StyleSheet.create({
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#362D59',
    marginBottom: 20,
  },
  buttonSpacer: {
    marginBottom: 8,
  },
  spacer: {
    height: 1,
    width: '100%',
    backgroundColor: '#c6becf',
    marginBottom: 16,
    marginTop: 8,
  },
});
