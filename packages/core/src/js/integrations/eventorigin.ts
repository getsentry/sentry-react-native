import type { Event, Integration } from '@sentry/core';

const INTEGRATION_NAME = 'EventOrigin';

/** Default EventOrigin instrumentation */
export const eventOriginIntegration = (): Integration => {
  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      // noop
    },
    processEvent: (event: Event) => {
      event.tags = event.tags ?? {};

      event.tags['event.origin'] = 'javascript';
      event.tags['event.environment'] = 'javascript';

      return event;
    },
  };
};
