/* eslint-disable import/no-unresolved, @typescript-eslint/no-unsafe-member-access */
import * as Sentry from '@sentry/react-native';
import * as React from 'react';
import { Text, View } from 'react-native';

import { SENTRY_INTERNAL_DSN } from './dsn';
import { getTestProps } from './utils/getTestProps';

export { getTestProps };
/**
 * This screen is for internal end-to-end testing purposes only. Do not use.
 * Not visible through the UI (no button to load it).
 */
const EndToEndTestsScreen = (): JSX.Element => {
  const [eventId, setEventId] = React.useState<string | null | undefined>();

  // !!! WARNING: Do not put Sentry.init inside React.useEffect like we do here. This is only for testing purposes.
  // We only do this to render the eventId onto the UI for end to end tests.
  React.useEffect(() => {
    Sentry.init({
      dsn: SENTRY_INTERNAL_DSN,
      beforeSend: (e) => {
        setEventId(e.event_id || null);
        return e;
      },
    });
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
        {...getTestProps('throwNewError')}
        onPress={() => {
          throw new Error('throw new error test');
        }}>
        throw new Error
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
      <Text
        onPress={() => {
          Sentry.nativeCrash();
        }}>
        nativeCrash
      </Text>
    </View>
  );
};

export default EndToEndTestsScreen;
