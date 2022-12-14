import React from 'react';
import {
  StatusBar,
  ScrollView,
  Text,
  Button as NativeButton,
  View,
  ButtonProps,
  StyleSheet,
} from 'react-native';

import * as Sentry from '@sentry/react-native';

import { setScopeProperties } from '../setScopeProperties';
import { StackNavigationProp } from '@react-navigation/stack';
import { CommonActions } from '@react-navigation/native';
import { UserFeedbackModal } from '../components/UserFeedbackModal';

interface Props {
  navigation: StackNavigationProp<any, 'HomeScreen'>;
}

const HomeScreen = (props: Props) => {
  // Show bad code inside error boundary to trigger it.
  const [showBadCode, setShowBadCode] = React.useState(false);
  const [isFeedbackVisible, setFeedbackVisible] = React.useState(false);

  const onPressPerformanceTiming = () => {
    // Navigate with a reset action just to test
    props.navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [
          { name: 'Home' },
          {
            name: 'PerformanceTiming',
            params: { someParam: 'hello' },
          },
        ],
      }),
    );
  };

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={{
          padding: 20,
        }}>
        <Text style={styles.welcomeTitle}>Hey there!</Text>
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
            Promise.reject('Unhandled Promise Rejection');
          }}
        />
        <Button
          title="Native Crash"
          onPress={() => {
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

        <Spacer />

        <Sentry.ErrorBoundary
          fallback={({ eventId }) => (
            <Text>Error boundary caught with event id: {eventId}</Text>
          )}>
          <Button
            title="Activate Error Boundary"
            onPress={() => {
              setShowBadCode(true);
            }}
          />
          {showBadCode && <div />}
        </Sentry.ErrorBoundary>

        <Spacer />

        <Button
          title="Add attachment"
          onPress={() => {
            Sentry.configureScope(scope => {
              scope.addAttachment({
                data: 'Attachment content',
                filename: 'attachment.txt',
              });
            });
          }}
        />
        <Button
          title="Get attachments"
          onPress={async () => {
            Sentry.configureScope(scope => {
              console.log('Attachments:', scope.getAttachments());
            });
          }}
        />
        <Button
          title="Auto Tracing Example"
          onPress={() => {
            props.navigation.navigate('Tracker');
          }}
        />
        <Button
          title="Manual Tracing Example"
          onPress={() => {
            props.navigation.navigate('ManualTracker');
          }}
        />
        <Button title="Performance Timing" onPress={onPressPerformanceTiming} />
        <Button
          title="Redux Example"
          onPress={() => {
            props.navigation.navigate('Redux');
          }}
        />
        <Button
          title="Send user feedback"
          onPress={() => {
            setFeedbackVisible(true);
          }}
        />
        {isFeedbackVisible ? (
          <UserFeedbackModal
            onDismiss={() => {
              setFeedbackVisible(false);
            }}
          />
        ) : null}
        <View style={{ marginTop: 32 }} />
      </ScrollView>
    </>
  );
};

const Button = (props: ButtonProps) => (
  <>
    <NativeButton {...props} color="#6C5FC7" />
    <View style={styles.buttonSpacer} />
  </>
);

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

export default HomeScreen;
