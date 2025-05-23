import { replayIntegration } from '@sentry/react';

import { notWeb } from '../utils/environment';
import type { Replay } from './replayInterface';

/**
 * ReplayConfiguration for browser replay integration.
 *
 * See the [Configuration documentation](https://docs.sentry.io/platforms/javascript/session-replay/configuration/) for more information.
 */
type ReplayConfiguration = Parameters<typeof replayIntegration>[0];

// https://github.com/getsentry/sentry-javascript/blob/e00cb04f1bbf494067cd8475d392266ba296987a/packages/replay-internal/src/integration.ts#L109
const INTEGRATION_NAME = 'Replay';

/**
 * Browser Replay integration for React Native.
 *
 * See the [Browser Replay documentation](https://docs.sentry.io/platforms/javascript/session-replay/) for more information.
 */
const browserReplayIntegration = (
  options: ReplayConfiguration = {},
): Replay => {
  if (notWeb()) {
    // This is required because because `replayIntegration` browser check doesn't
    // work for React Native.
    return browserReplayIntegrationNoop();
  }

  return replayIntegration({
    ...options,
    mask: ['.sentry-react-native-mask', ...(options.mask || [])],
    unmask: ['.sentry-react-native-unmask:not(.sentry-react-native-mask *) > *', ...(options.unmask || [])],
  });
};

const browserReplayIntegrationNoop = (): Replay => {
  return {
    name: INTEGRATION_NAME,
    start: () => {},
    startBuffering: () => {},
    stop: () => Promise.resolve(),
    flush: () => Promise.resolve(),
    getReplayId: () => undefined,
    getRecordingMode: () => undefined,
  };
};

export { browserReplayIntegration };
