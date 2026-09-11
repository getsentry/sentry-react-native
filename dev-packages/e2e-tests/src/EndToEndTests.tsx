import * as Sentry from '@sentry/react-native';
import * as React from 'react';
import { StatusBar, Text, View } from 'react-native';

const E2E_TESTS_READY_TEXT = 'E2E Tests Ready';

const EndToEndTestsScreen = (): React.JSX.Element => {
  const [isReady, setIsReady] = React.useState(false);
  const [eventId, setEventId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string>('No error');
  // Buffer-mode replay (replaysOnErrorSampleRate) only attaches a replay_id to
  // an error event if the native replay buffer captured at least one frame
  // before the error fired. This counter is tapped by the captureReplay e2e
  // flow to mutate the view hierarchy (side-effect free, no events sent) so the
  // buffer records frames before the exception is captured.
  const [replayPingCount, setReplayPingCount] = React.useState(0);
  // Surfaced by the flush path (startBuffering() + flush()) so the
  // bufferedReplayFlush e2e flow can query the replay directly by id, instead
  // of discovering it through a replay_id attached to a sent error event.
  const [replayId, setReplayId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const client: Sentry.ReactNativeClient | undefined = Sentry.getClient();

    if (!client) {
      setError('Client is not initialized');
      return;
    }

    // WARNING: This is only for testing purposes.
    // We only do this to render the eventId onto the UI for end to end tests.
    // Chain with existing beforeSend (set by mobileReplayIntegration) to
    // preserve replay_id processing.
    const existingBeforeSend = client.getOptions().beforeSend;
    client.getOptions().beforeSend = async (e, hint) => {
      const result = existingBeforeSend ? await existingBeforeSend(e, hint) : e;
      if (result) {
        setEventId(result.event_id);
      }
      return result;
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
    // RN 0.87 enables edge-to-edge by default, drawing content behind the
    // status bar. Offset by its height so "E2E Tests Ready" (and the rest of
    // the harness UI) stays visible to Maestro's assertVisible. StatusBar
    // .currentHeight is Android-only; falls back to 0 on iOS.
    <View style={{ paddingTop: StatusBar.currentHeight ?? 0 }}>
      <Text>{isReady ? E2E_TESTS_READY_TEXT : 'Loading...'}</Text>
      <Text>{error}</Text>
      {eventId ? <Text testID='eventId'>{eventId}</Text> : <Text>No event ID</Text>}
      <Text onPress={() => setEventId(null)}>
        Clear Event Id
      </Text>
      {replayId ? <Text testID='replayId'>{replayId}</Text> : <Text>No replay ID</Text>}
      <Text testID='replayPing' onPress={() => setReplayPingCount((count) => count + 1)}>
        Replay Ping {replayPingCount}
      </Text>
      {/* Manually starts a session replay via the runtime controls. The
          manualReplay e2e flow taps this with both sample rates off, so a
          replay_id can only reach the error event if getReplay().start()
          actually drove native recording across the bridge. */}
      <Text testID='startReplay' onPress={() => Sentry.getReplay()?.start()}>
        Start Replay
      </Text>
      {/* The replayStopResume e2e flow drives pause/resume/stop through the
          same runtime controls. pause() + resume() must not crash and must
          leave recording active; stop() must halt it (a later error then
          carries no replay). */}
      <Text testID='pauseReplay' onPress={() => Sentry.getReplay()?.pause()}>
        Pause Replay
      </Text>
      <Text testID='resumeReplay' onPress={() => Sentry.getReplay()?.resume()}>
        Resume Replay
      </Text>
      <Text testID='stopReplay' onPress={() => Sentry.getReplay()?.stop()}>
        Stop Replay
      </Text>
      {/* The bufferedReplayFlush e2e flow taps these to exercise the no-error
          path: startBuffering() records a buffer regardless of sample rate, and
          flush() converts it to a session replay and uploads it immediately,
          without an error event ever being captured. The flush handler then
          renders getReplay().getReplayId() so the flow can query that replay
          directly, instead of discovering it through a sent error. */}
      <Text testID='startBufferingReplay' onPress={() => Sentry.getReplay()?.startBuffering()}>
        Start Buffering Replay
      </Text>
      <Text
        testID='flushReplay'
        onPress={async () => {
          const replay = Sentry.getReplay();
          await replay?.flush();
          setReplayId(replay?.getReplayId() ?? null);
        }}>
        Flush Replay
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
