import * as Sentry from '@sentry/react-native';
import * as React from 'react';
import { Text, View } from 'react-native';
import { LaunchArguments } from "react-native-launch-arguments";

const E2E_TESTS_READY_TEXT = 'E2E Tests Ready';

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
  const [isReady, setIsReady] = React.useState(false);
  const [eventId, setEventId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string>('No error');

  React.useEffect(() => {
    const client: Sentry.ReactNativeClient | undefined = Sentry.getClient();

    if (!client) {
      setError('Client is not initialized');
      return;
    }

    // WARNING: This is only for testing purposes.
    // We only do this to render the eventId onto the UI for end to end tests.
    client.getOptions().beforeSend = (e) => {
      setEventId(e.event_id);
      return e;
    };

    setIsReady(true);
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
      id: 'feedback',
      name: 'Feedback',
      action: () => Sentry.showFeedbackButton(),
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
      <Text>{isReady ? E2E_TESTS_READY_TEXT : 'Loading...'}</Text>
      <Text>{error}</Text>
      {eventId ? <Text testID='eventId'>{eventId}</Text> : <Text>No event ID</Text>}
      <Text onPress={() => setEventId(null)}>
        Clear Event Id
      </Text>
      {testCases.map((testCase) => (
        <Text key={testCase.id} onPress={testCase.action}>
          {testCase.name}
        </Text>
      ))}
    </View>
  );
};

export default EndToEndTestsScreen;
