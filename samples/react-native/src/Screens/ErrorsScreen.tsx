import React, { useEffect } from 'react';
import {
  ButtonProps,
  Button as NativeButton,
  NativeModules,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { StackNavigationProp } from '@react-navigation/stack';
import { FallbackRender } from '@sentry/react';
import * as Sentry from '@sentry/react-native';

import NativePlatformSampleModule from '../../tm/NativePlatformSampleModule';
import NativeSampleModule from '../../tm/NativeSampleModule';
import { UserFeedbackModal } from '../components/UserFeedbackModal';
import { setScopeProperties } from '../setScopeProperties';
import { TimeToFullDisplay } from '../utils';
import type { Event as SentryEvent } from '@sentry/core';

const { AssetsModule, CppModule, CrashModule, TestControlModule } = NativeModules;

interface Props {
  navigation: StackNavigationProp<any, 'HomeScreen'>;
}

const ErrorsScreen = (_props: Props) => {
  // Show bad code inside error boundary to trigger it.
  const [showBadCode, setShowBadCode] = React.useState(false);
  const [isFeedbackVisible, setFeedbackVisible] = React.useState(false);
  const [isFeedbackButtonVisible, setFeedbackButtonVisible] =
    React.useState(false);

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
        <TimeToFullDisplay record={true} />
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
          title="Capture exception with breadcrumb"
          onPress={() => {
            Sentry.captureException(
              new Error('Captured exception with breadcrumb'),
              context =>
                context.addBreadcrumb({ message: 'error with breadcrumb' }),
            );
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
          title="Send count metric"
          onPress={() => {
            Sentry.metrics.count('count_metric', 1);
          }}
        />
        <Button
          title="Send distribution metric"
          onPress={() => {
            Sentry.metrics.count('distribution_metric', 100);
          }}
        />
        <Button
          title="Send count metric with attributes"
          onPress={() => {
            Sentry.metrics.count('count_metric', 100, { attributes: { from_test_app: true } });
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
        <Button
          title="Log console"
          onPress={() => {
            Sentry.logger.info('info log');
            Sentry.logger.trace('trace log');
            Sentry.logger.debug('debug log');
            Sentry.logger.warn('warn log');
            Sentry.logger.error('error log');

            Sentry.logger.info('info log with data', { database: 'admin', number: 123, obj: { password: 'admin' } });
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
                CrashModule.crashOrNumber().then((n: number) => {
                  console.log('Got number: ' + n);
                });
              }}
            />
            <Button
              title="Enable Crash on Start"
              onPress={() => {
                TestControlModule?.enableCrashOnStart()
                  .then(() => {
                    console.log('Crash on start enabled. Restart app to crash.');
                  })
                  .catch((e: Error) => {
                    console.error('Failed to enable crash on start:', e);
                  });
              }}
            />
            <Button
              title="Disable Crash on Start"
              onPress={() => {
                TestControlModule?.disableCrashOnStart()
                  .then(() => {
                    console.log('Crash on start disabled.');
                  })
                  .catch((e: Error) => {
                    console.error('Failed to disable crash on start:', e);
                  });
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
            const scope = Sentry.getGlobalScope();
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
            Sentry.captureMessage('Message with different types of tags globally');
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
        <Button
          title="Set different types of tags in scope"
          onPress={async () => {
            const evt: SentryEvent = {
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

        <Button
          title="Feedback form"
          onPress={() => {
            _props.navigation.navigate('FeedbackWidget');
          }}
        />
        <Button
          title="Feedback form (auto)"
          onPress={() => {
            Sentry.showFeedbackWidget();
          }}
        />
        <Button
          title="Show/Hide Feedback Button"
          onPress={() => {
            if (isFeedbackButtonVisible) {
              Sentry.hideFeedbackButton();
              setFeedbackButtonVisible(false);
            } else {
              Sentry.showFeedbackButton();
              setFeedbackButtonVisible(true);
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
