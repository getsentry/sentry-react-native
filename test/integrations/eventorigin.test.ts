import type { Event } from '@sentry/types';

import { EventOrigin } from '../../src/js/integrations';

describe('Event Origin', () => {
  it('Adds event.origin and event.environment javascript tags to events', done => {
    const integration = new EventOrigin();

    const mockEvent: Event = {};

    integration.setupOnce(async eventProcessor => {
      try {
        const processedEvent = await eventProcessor(mockEvent, {});

        expect(processedEvent).toBeDefined();
        if (processedEvent) {
          expect(processedEvent.tags).toBeDefined();
          if (processedEvent.tags) {
            expect(processedEvent.tags['event.origin']).toBe('javascript');
            expect(processedEvent.tags['event.environment']).toBe('javascript');
          }
        }

        done();
      } catch (e) {
        done(e);
      }
    });
  });
});
