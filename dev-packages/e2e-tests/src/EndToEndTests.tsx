import * as Sentry from '@sentry/react-native';
import * as React from 'react';
import { Text, View } from 'react-native';
import { LaunchArguments } from "react-native-launch-arguments";

import { getTestProps } from './utils/getTestProps';
import { fetchEvent } from './utils/fetchEvent';

const { sentryAuthToken } = LaunchArguments.value<{
  sentryAuthToken: unknown;
}>();

if (typeof sentryAuthToken !== 'string') {
  throw new Error('Sentry Auth Token is required');
}

if (sentryAuthToken.length === 0) {
  throw new Error('Sentry Auth Token must not be empty');
}


const EndToEndTestsScreen = (): JSX.Element => {
  const [eventId, setEventId] = React.useState<string | null | undefined>();

  async function assertEventReceived(eventId: string | undefined) {
    if (!eventId) {
      throw new Error('Event ID is required');
    }

    if (!sentryAuthToken || typeof sentryAuthToken !== 'string') {
      throw new Error('Sentry Auth Token is required');
    }

    await fetchEvent(eventId, sentryAuthToken);

    setEventId(eventId);
  }

  React.useEffect(() => {
    const client: Sentry.ReactNativeClient | undefined = Sentry.getClient();

    if (!client) {
      throw new Error('Client is not initialized');
    }

    // WARNING: This is only for testing purposes.
    // We only do this to render the eventId onto the UI for end to end tests.
    client.getOptions().beforeSend = (e) => {
      assertEventReceived(e.event_id);
      return e;
    };
  }, []);

  const testCases = [
    {
      id: 'captureMessage',
      name: 'Capture Message',
      action: () => Sentry.captureMessage('React Native Test Message'),
    },
    {
      id: 'captureException',
      name: 'Capture Exception',
      action: () => Sentry.captureException(new Error('captureException test')),
    },
    {
      id: 'unhandledPromiseRejection',
      name: 'Unhandled Promise Rejection',
      action: async () => await Promise.reject(new Error('Unhandled Promise Rejection')),
    },
    {
      id: 'close',
      name: 'Close',
      action: async () => await Sentry.close(),
    },
  ];

  return (
    <View>
      <Text {...getTestProps('eventId')}>{eventId}</Text>
      <Text {...getTestProps('clearEventId')} onPress={() => setEventId('')}>
        Clear Event Id
      </Text>
      {testCases.map((testCase) => (
        <Text key={testCase.id} {...getTestProps(testCase.id)} onPress={testCase.action}>
          {testCase.name}
        </Text>
      ))}
    </View>
  );
};

export default EndToEndTestsScreen;
