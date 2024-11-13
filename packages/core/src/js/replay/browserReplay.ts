import { replayIntegration } from '@sentry/react';

const browserReplayIntegration = (options: Parameters<typeof replayIntegration>[0] = {}) => {
  return replayIntegration({
    ...options,
    mask: ['div.sentry-react-native-mask', ...(options.mask || [])],
    unmask: ['div.sentry-react-native-unmask:not(div.sentry-react-native-mask *) > *', ...(options.unmask || [])],
  });
};

export { browserReplayIntegration };
