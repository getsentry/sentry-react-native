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
import { TimeToFullDisplay } from '../utils';
import type { Event as SentryEvent } from '@sentry/core';
import { debug } from '@sentry/core';

const { AssetsModule, CppModule, CrashModule } = NativeModules;

interface Props {
  navigation: StackNavigationProp<any, 'HomeScreen'>;
}

const ErrorsScreen = (_props: Props) => {
  // Show bad code inside error boundary to trigger it.
  const [showBadCode, setShowBadCode] = React.useState(false);
  const [isFeedbackVisible, setFeedbackVisible] = React.useState(false);
  const [isFeedbackButtonVisible, setFeedbackButtonVisible] = React.useState(false);

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
            Sentry.captureException(new Error('Captured exception with breadcrumb'),
              context => context.addBreadcrumb({ message: 'error with breadcrumb' }));
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
        <Button
          title="Log console"
          onPress={() => {

                // Single bad item based on loop level
                const badItems = [
                  "{'a': 1}", // bad1 - single quotes
                  '{"a": 1,}', // bad2 - trailing comma
                  '{"a":"line\nbreak"}', // bad3 - literal newline
                  '{"a": NaN}', // bad4 - NaN  / PROBLEMATIC
                  '{"a":"\uD800"}', // bad5 - lone surrogate / PROBLEMATIC
                  '/* comment */{"a":1}', // bad6 - C-style comments
                  '{"a": 0x1}', // bad7 - hex literal
                  null, // bad8
                  undefined, // bad9
                  false, // bad10
                  0x1, // bad11 - hex
                  1, // bad12
                  '\n', // bad13 // ALSO BAD
                  '}', // bad14
                  1.1, // bad15
                  Number.MAX_SAFE_INTEGER, // bad16
                  Number.MIN_SAFE_INTEGER, // bad17
                  Number.MAX_VALUE, // bad18
                  Number.MIN_VALUE, // bad19
                  '{"a": Infinity}', // bad20 - Infinity
                  '{"a": 1', // bad21
                  123n, // bad22 - BigInt → JSON.stringify throws
                  { a: undefined }, // bad23 - undefined in object → dropped
                  { a: () => 42 }, // bad24 - function in object → dropped
                  { a: Symbol('x') }, // bad25 - symbol in object → dropped
                  [1, undefined, () => {}, Symbol('y')], // bad26 - array weirdness → nulls
                  { a: NaN, b: Infinity, c: -Infinity }, // bad27 - become null
                  { a: new Date() }, // bad28 - becomes ISO string
                  { a: /abc/ }, // bad29 - regex → dropped
                  { a: new Map([['k', 1]]) }, // bad30 - Map → {}
                  { a: new Set([1, 2, 3]) }, // bad31 - Set → {}
                  new Array(50).fill(0), // bad32 - huge array → memory issues
                  [,], // bad33
                  [1, , 1], //bad34
                  {}, // bad35
                  '\0', // bad36
                  '\x2550000000000000000000000000000000000000000000000000000000000000000', // bad37
                  '{\n', // bad38
                  { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x: { x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{x:{X:['hi']}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}, //bad39
                ];


            // Loop with 20 iterations, each executing every 10 seconds
            for (let loopLevel = 1; loopLevel <= badItems.length + 1; loopLevel++) {
              setTimeout(() => {
                debug.log(`lets break this (LVL ${loopLevel})`);

                const badItem = badItems[loopLevel - 1]; // Get the bad item for this loop level

                Sentry.logger.error(`lets break this (LVL ${loopLevel})`, {
                  [`bad${loopLevel}`]: badItem,
                  ['release']: badItem,
                });

                // Generate healthy logs for this loop level
                for (let i = 0; i < 30; i++){
                  Sentry.logger.info(`LOOP ${loopLevel} healthy log 0 - ${i + 1}`);
                }
                Sentry.logger.error(`lets break this (LVL ${loopLevel})`, {
                  [`bad${loopLevel}`]: badItem,
                  ['release']: badItem,
                });


                Sentry.logger.error(`lets break this (LVL ${loopLevel})`, {
                  [`bad${loopLevel}`]: badItem,
                  ['release']: badItem,
                });
              }, loopLevel * 10000); // Each loop executes 10 seconds after the previous one
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
