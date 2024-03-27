import type { Event, Integration } from '@sentry/types';

/** Default EventOrigin instrumentation */
export const eventOriginIntegration = (): Integration => {
  return {
    name: 'EventOrigin',
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
