import React, { useEffect } from 'react';
import {
  StatusBar,
  ScrollView,
  Text,
  Button as NativeButton,
  View,
  ButtonProps,
  StyleSheet,
  NativeModules,
  Platform,
} from 'react-native';

import * as Sentry from '@sentry/react-native';

import { setScopeProperties } from '../setScopeProperties';
import { StackNavigationProp } from '@react-navigation/stack';
import { UserFeedbackModal } from '../components/UserFeedbackModal';
import { FallbackRender } from '@sentry/react';
import NativeSampleModule from '../../tm/NativeSampleModule';
import NativePlatformSampleModule from '../../tm/NativePlatformSampleModule';
import { timestampInSeconds } from '@sentry/utils';

const { AssetsModule, CppModule, CrashModule } = NativeModules;

interface Props {
  navigation: StackNavigationProp<any, 'HomeScreen'>;
}

const ErrorsScreen = (_props: Props) => {
  const [componentMountStartTimestamp] = React.useState<number>(() => {
    return timestampInSeconds();
  });

  React.useEffect(() => {
    if (componentMountStartTimestamp) {
      // Distributions help you get the most insights from your data by allowing you to obtain aggregations such as p90, min, max, and avg.
      Sentry.metrics.distribution(
        'home_mount_time',
        timestampInSeconds() - componentMountStartTimestamp,
        {
          unit: 'seconds',
        },
      );
    }
    // We only want this to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show bad code inside error boundary to trigger it.
  const [showBadCode, setShowBadCode] = React.useState(false);
  const [isFeedbackVisible, setFeedbackVisible] = React.useState(false);

  const errorBoundaryFallback: FallbackRender = ({ eventId }) => (
    <Text>Error boundary caught with event id: {eventId}</Text>
  );

  const [data, setData] = React.useState<Uint8Array | null>(null);
  useEffect(() => {
    AssetsModule?.getExampleAssetData().then((asset: number[]) =>
      setData(new Uint8Array(asset)),
    );
  }, []);

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.mainView}>
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
          title="Capture exception with cause"
          onPress={() => {
            const error = new Error('Captured exception');
            (error as { cause?: unknown }).cause = new Error(
              'Cause of captured exception',
            );
            Sentry.captureException(error);
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
          title="Get Crashed Last Run"
          onPress={async () => {
            const crashed = await Sentry.crashedLastRun();
            console.log('Crashed last run:', crashed);
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
        <Button
          title="console.warn()"
          onPress={() => {
            console.warn('This is a warning.');
          }}
        />
        <Button
          title="Crash in Cpp"
          onPress={() => {
            NativeSampleModule?.crash();
          }}
        />
        <Button
          title="Catch Turbo Crash or String"
          onPress={() => {
            if (!NativePlatformSampleModule) {
              throw new Error(
                'NativePlatformSampleModule is not available. Build the application with the New Architecture enabled.',
              );
            }
            try {
              NativePlatformSampleModule?.crashOrString();
            } catch (e) {
              Sentry.captureException(e);
            }
          }}
        />
        {Platform.OS === 'android' && (
          <>
            <Button
              title="Crash in Android Cpp"
              onPress={() => {
                CppModule?.crashCpp();
              }}
            />
            <Button
              title="JVM Crash or Undefined"
              onPress={() => {
                CrashModule.crashOrUndefined();
              }}
            />
            <Button
              title="JVM Crash or Number"
              onPress={() => {
                CrashModule.crashOrNumber();
              }}
            />
          </>
        )}
        <Spacer />
        <Sentry.ErrorBoundary fallback={errorBoundaryFallback}>
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
                contentType: 'text/plain',
              });
              if (data) {
                scope.addAttachment({
                  data,
                  filename: 'logo.png',
                  contentType: 'image/png',
                });
              }
              console.log('Sentry attachment added.');
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
          title="Capture HTTP Client Error"
          onPress={async () => {
            try {
              fetch('http://localhost:8081/not-found');
            } catch (error) {
              //ignore the error, it will be send to Sentry automatically
            }
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
        <View style={styles.mainViewBottomWhiteSpace} />
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
  mainView: {
    padding: 20,
  },
  mainViewBottomWhiteSpace: {
    marginTop: 32,
  },
});

export default ErrorsScreen;
