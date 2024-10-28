import * as Sentry from '@sentry/react-native';
import * as React from 'react';
import { Text, View } from 'react-native';
import { LaunchArguments } from "react-native-launch-arguments";

import { getTestProps } from './utils/getTestProps';
import { fetchEvent } from './utils/fetchEvent';

const getSentryAuthToken = ():
  | { token: string }
  | { error: string } => {
  const { sentryAuthToken } = LaunchArguments.value<{
    sentryAuthToken: unknown;
  }>();

  if (typeof sentryAuthToken !== 'string') {
    return { error: 'Sentry Auth Token is required' };
  }

  if (sentryAuthToken.length === 0) {
    return { error: 'Sentry Auth Token must not be empty' };
  }

  return { token: sentryAuthToken };
};

const EndToEndTestsScreen = (): JSX.Element => {
  const [eventId, setEventId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string>('No error');
  const [crashedLastRun, setCrashedLastRun] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    (async () => {
      const crashedLastRun = await Sentry.crashedLastRun();
      console.log('crashedLastRun', crashedLastRun);
      setCrashedLastRun(crashedLastRun);
    })();
  }, []);

  async function assertEventReceived(eventId: string | undefined) {
    if (!eventId) {
      setError('Event ID is required');
      return;
    }

    const value = getSentryAuthToken();
    if ('error' in value) {
      setError(value.error);
      return;
    }

    await fetchEvent(eventId, value.token);

    setEventId(eventId);
  }

  React.useEffect(() => {
    const client: Sentry.ReactNativeClient | undefined = Sentry.getClient();

    if (!client) {
      setError('Client is not initialized');
      return;
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
    {
      id: 'crash',
      name: 'Crash',
      action: () => Sentry.nativeCrash(),
    },
  ];

  return (
    <View>
      <Text>Sentry RN E2E Tests</Text>
      <Text>{error}</Text>
      {eventId && <Text {...getTestProps('eventId')}>{eventId}</Text>}
      {crashedLastRun && <Text {...getTestProps('crashedLastRun')}>Crashed Last Run</Text>}
      <Text {...getTestProps('clearEventId')} onPress={() => setEventId(null)}>
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
