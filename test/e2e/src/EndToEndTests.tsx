/* eslint-disable import/no-unresolved, @typescript-eslint/no-unsafe-member-access */
import * as Sentry from '@sentry/react-native';
import * as React from 'react';
import { Text, View } from 'react-native';

import { getTestProps } from './utils/getTestProps';

export { getTestProps };
/**
 * This screen is for internal end-to-end testing purposes only. Do not use.
 * Not visible through the UI (no button to load it).
 */
// Deprecated in https://github.com/DefinitelyTyped/DefinitelyTyped/commit/f1b25591890978a92c610ce575ea2ba2bbde6a89
// eslint-disable-next-line deprecation/deprecation
const EndToEndTestsScreen = (): JSX.Element => {
  const [eventId, setEventId] = React.useState<string | null | undefined>();

  // !!! WARNING: This is only for testing purposes.
  // We only do this to render the eventId onto the UI for end to end tests.
  React.useEffect(() => {
    const client: Sentry.ReactNativeClient | undefined = Sentry.getCurrentHub().getClient();
    client.getOptions().beforeSend = (e: Sentry.Event) => {
      setEventId(e.event_id || null);
      return e;
    };
  }, []);

  return (
    <View>
      <Text {...getTestProps('eventId')}>{eventId}</Text>
      <Text {...getTestProps('clearEventId')} onPress={() => setEventId('')}>
        Clear Event Id
      </Text>
      <Text
        {...getTestProps('captureMessage')}
        onPress={() => {
          Sentry.captureMessage('React Native Test Message');
        }}>
        captureMessage
      </Text>
      <Text
        {...getTestProps('captureException')}
        onPress={() => {
          Sentry.captureException(new Error('captureException test'));
        }}>
        captureException
      </Text>
      <Text
        onPress={async () => {
          await Promise.reject(new Error('Unhandled Promise Rejection'));
        }}
        {...getTestProps('unhandledPromiseRejection')}>
        Unhandled Promise Rejection
      </Text>
      <Text
        {...getTestProps('close')}
        onPress={async () => {
          await Sentry.close();
        }}>
        close
      </Text>
    </View>
  );
};

export default EndToEndTestsScreen;
