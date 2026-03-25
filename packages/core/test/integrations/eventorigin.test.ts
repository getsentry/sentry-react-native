import type { Client } from '@sentry/core';

import { eventOriginIntegration } from '../../src/js/integrations/eventorigin';

describe('Event Origin', () => {
  it('Adds event.origin and event.environment javascript tags to events', async () => {
    const integration = eventOriginIntegration();

    const processedEvent = await integration.processEvent!({}, {}, {} as Client);
    expect(processedEvent?.tags?.['event.origin']).toBe('javascript');
    expect(processedEvent?.tags?.['event.environment']).toBe('javascript');
  });
});
