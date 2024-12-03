import { replayIntegration } from '@sentry/react';

const browserReplayIntegration = (
  options: Parameters<typeof replayIntegration>[0] = {},
): ReturnType<typeof replayIntegration> => {
  return replayIntegration({
    ...options,
    mask: ['.sentry-react-native-mask', ...(options.mask || [])],
    unmask: ['.sentry-react-native-unmask:not(.sentry-react-native-mask *) > *', ...(options.unmask || [])],
  });
};

export { browserReplayIntegration };
