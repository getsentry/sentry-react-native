import React, {useEffect} from 'react';
import {ScrollView, Text, Platform} from 'react-native';

import * as Sentry from '@sentry/react-native';

import {getTestProps} from '../../utils/getTestProps';
import {SENTRY_INTERNAL_DSN} from '../dsn';

const EndToEndTestsScreen = () => {
  const [eventId, setEventId] = React.useState(null);

  // !!! WARNING: Do not put Sentry.init inside React.useEffect like we do here. This is only for testing purposes.
  // We only do this to render the eventId onto the UI for end to end tests.
  React.useEffect(() => {
    Sentry.init({
      dsn: SENTRY_INTERNAL_DSN,
      beforeSend: (e) => {
        setEventId(e.event_id);
        return e;
      },
    });
  }, []);

  return (
    <ScrollView>
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
        onPress={() => {
          Sentry.nativeCrash();
        }}>
        nativeCrash
      </Text>
    </ScrollView>
  );
};

export default EndToEndTestsScreen;
