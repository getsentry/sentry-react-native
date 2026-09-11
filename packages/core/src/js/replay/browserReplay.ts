import { debug } from '@sentry/core';
import { replayIntegration } from '@sentry/react';

import type { Replay } from './replayInterface';

import { notWeb } from '../utils/environment';

/**
 * ReplayConfiguration for browser replay integration.
 *
 * See the [Configuration documentation](https://docs.sentry.io/platforms/javascript/session-replay/configuration/) for more information.
 */
type ReplayConfiguration = Parameters<typeof replayIntegration>[0];

// https://github.com/getsentry/sentry-javascript/blob/e00cb04f1bbf494067cd8475d392266ba296987a/packages/replay-internal/src/integration.ts#L109
const INTEGRATION_NAME = 'Replay';

export const BROWSER_REPLAY_INTEGRATION_NAME = INTEGRATION_NAME;

/**
 * Browser Replay integration for React Native.
 *
 * See the [Browser Replay documentation](https://docs.sentry.io/platforms/javascript/session-replay/) for more information.
 */
const browserReplayIntegration = (options: ReplayConfiguration = {}): Replay => {
  if (notWeb()) {
    // This is required because `replayIntegration` browser check doesn't
    // work for React Native.
    return browserReplayIntegrationNoop();
  }

  // `replayIntegration` returns a class instance whose controls (`start`,
  // `stop`, `flush`, …) and lifecycle hooks (`afterAllSetup`, `processSpan`)
  // live on the prototype. It must NOT be spread — a spread would drop every
  // prototype method and break the integration. We attach `pause`/`resume`
  // directly on the instance instead.
  const integration = replayIntegration({
    ...options,
    mask: ['.sentry-react-native-mask', ...(options.mask || [])],
    unmask: ['.sentry-react-native-unmask:not(.sentry-react-native-mask *) > *', ...(options.unmask || [])],
  }) as unknown as Replay;

  // `pause`/`resume` are part of the shared `Replay` interface (native-backed on
  // mobile) but the browser Session Replay SDK does not expose them, so they are
  // no-ops that log on Web to keep the cross-platform API interchangeable.
  integration.pause = pauseNoop;
  integration.resume = resumeNoop;
  return integration;
};

const pauseNoop = (): void => {
  debug.log(`[${INTEGRATION_NAME}] \`pause()\` is not supported on Web. No-op.`);
};

const resumeNoop = (): void => {
  debug.log(`[${INTEGRATION_NAME}] \`resume()\` is not supported on Web. No-op.`);
};

const browserReplayIntegrationNoop = (): Replay => {
  return {
    name: INTEGRATION_NAME,
    start: () => {},
    startBuffering: () => {},
    stop: () => Promise.resolve(),
    pause: () => {},
    resume: () => {},
    flush: () => Promise.resolve(),
    getReplayId: () => undefined,
  };
};

export { browserReplayIntegration };
