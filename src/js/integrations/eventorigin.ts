import { convertIntegrationFnToClass } from '@sentry/core';
import type { Event, Integration, IntegrationClass, IntegrationFnResult } from '@sentry/types';

const INTEGRATION_NAME = 'EventOrigin';

/** Default EventOrigin instrumentation */
export const eventOriginIntegration = (): IntegrationFnResult => {
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

/**
 * Default EventOrigin instrumentation
 *
 * @deprecated Use `eventOriginIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const EventOrigin = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  eventOriginIntegration,
) as IntegrationClass<Integration>;
